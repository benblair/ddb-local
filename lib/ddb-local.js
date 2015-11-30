
var childProcess = require('child_process');
var tar = require('tar');
var zlib = require('zlib');
var path = require('path');
var request = require('request');
var fs = require('fs');
var mkdirp = require('mkdirp');
var async = require('async');

var AWS = require('aws-sdk');

var DDB_PORT = process.env.DDB_PORT || 0xddb; // 3547
var DDB_DOWNLOAD_URL = 'http://dynamodb-local.s3-website-us-west-2.amazonaws.com/dynamodb_local_latest.tar.gz';
var DDB_JAR_NAME = 'DynamoDBLocal.jar';

var DEFAULT_DOWNLOAD_PATH = './tmp/bin/';
var MAX_PROC_START_WAIT = 5000;
var PROC_START_RETRY_WAIT = 500;

var dynamoParams = {
    apiVersion: '2012-08-10',
    maxRetries: 5,
    httpOptions: {
        timeout: 5000
    }
};

var DdbLocal = function (params) {
    params = params || {};
    this.jarDir = params.jarDir || DEFAULT_DOWNLOAD_PATH;
    this._proc = null;
    this.port = params.port || DDB_PORT;
    dynamoParams.endpoint = process.env.AWS_DDB_ENDPOINT || ('http://localhost:' + this.port);
    this.endpoint = dynamoParams.endpoint;
    this.client = new AWS.DynamoDB(dynamoParams);
    this._exitCallback = function() {};
    this.inMemory = true;
    if (params.inMemory === false || process.env.DDB_LOCAL_IN_MEMORY === 'false') {
        this.inMemory = false;
    }
};

DdbLocal.prototype.start = function (callback) {
    var self = this;
    self.isRunning(function (err, isRunning) {
        if (err) {
            return callback(err);
        }
        if (isRunning) {
            return callback();
        }
        self._isDownloaded(function (err, isDownloaded) {
            if (err) {
                return callback(err);
            }
            if (isDownloaded) {
                return self._start(callback);
            }
            return self._download(function (err) {
                if (err) {
                    return callback(err);
                }
                self._start(callback);
            });
        });
    });
};

DdbLocal.prototype.isRunning = function (callback) {
    this.client.listTables(function (err, tables) {
        if (err) {
            return callback(null, false);
        }
        return callback(null, true);
    });
};

DdbLocal.prototype._isDownloaded = function (callback) {
    var self = this;
    fs.stat(self.jarDir, function (err, stats) {
        if (err) {
            return mkdirp(self.jarDir, function (err) {
                if (err) {
                    return callback(err);
                }
                // Try again, now that we've created the dir
                self._isDownloaded(callback);
            });
        }
        fs.stat(path.join(self.jarDir, DDB_JAR_NAME), function (err, stats) {
            if (err) {
                return callback(null, false);
            }
            return callback(null, true);
        });
    });
};

DdbLocal.prototype._download = function (callback) {
    var self = this;
    var archivePath = path.join(self.jarDir, path.basename(DDB_DOWNLOAD_URL));
    request(DDB_DOWNLOAD_URL)
        .pipe(fs.createWriteStream(archivePath))
        .on('error', callback)
        .on('close', function () {
            if (process.env.VERBOSE) {
                console.log('Downloaded DynamoDBLocal');
            }
            self._unzipJar(callback);
        });
};

DdbLocal.prototype._unzipJar = function (callback) {
    var self = this;
    var jarDir = path.resolve(self.jarDir);
    var archivePath = path.join(self.jarDir, path.basename(DDB_DOWNLOAD_URL));
    var extract = tar.Extract({ path: jarDir, strip: 0 });
    var gzipFile = fs.createReadStream(archivePath);
    var tarFile = gzipFile.pipe(zlib.createGunzip());

    tarFile.pipe(extract);

    extract.on('error', callback);
    gzipFile.on('error', callback);
    tarFile.on('error', callback);

    extract.on('end', callback);
};

DdbLocal.prototype._start = function (callback) {
    var self = this;
    var javaArgs = [
        '-Djava.library.path=./DynamoDBLocal_lib',
        '-jar', DDB_JAR_NAME,
        '--port', '' + DDB_PORT
    ];
    if (self.inMemory === true) {
        javaArgs.push('-inMemory');
    }
    var procParams = {
            cwd: self.jarDir,
            stdio: 'pipe',
            detached: false
    };
    self._proc = childProcess.spawn('java', javaArgs, procParams);
    self._proc.on('exit', function () {
        if (process.env.VERBOSE) {
            console.log('DDB Local Exited');
        }
    });
    self._proc.on('close', function () {
        if (process.env.VERBOSE) {
            console.log('DDB Local Closed');
        }
        if (self._exitCallback) {
            self._exitCallback();
        }
    });
    self._proc.on('error', function (err) {
        console.log('DDB Local Error: %s', err);
    });
    self._proc.stdout.on('data', function (buffer) {
        if (process.env.VERBOSE) {
            console.log(buffer.toString());
        }
    });
    self._proc.stderr.on('data', function (buffer) {
        console.log('Error: %s', buffer.toString());
    });
    var waitTime = 0;
    var waitForRunning = function () {
        self.isRunning(function (err, isRunning) {
            if (err) {
                return callback(err);
            }
            if (isRunning) {
                return self._clearData(callback);
            }
            if (waitTime > MAX_PROC_START_WAIT) {
                err = new Error('Timeout waiting for DDB Local startup');
                return callback(err);
            }
            waitTime += PROC_START_RETRY_WAIT;
            setTimeout(waitForRunning, PROC_START_RETRY_WAIT);
        });
    };
    waitForRunning();
};

DdbLocal.prototype.stop = function (callback) {
    var self = this;
    self._exitCallback = callback;
    if (self._proc) {
        self._proc.kill();
    }
};

DdbLocal.prototype._clearData = function (callback) {
    var self = this;
    if (self.client.endpoint.hostname !== 'localhost') {
        return callback(new Error('WARNING!!!! DDB-Local not pointed to' +
        ' localhost. Risk of data loss. Terminating test.'));
    }
    self.client.listTables(function (err, results) {
        if (err) {
            return callback(null, false);
        }
        async.each(results.TableNames, function (name, done) {
            if (process.env.VERBOSE) {
                console.log('deleting table ' + name + '...');
            }
            self.client.deleteTable({
                TableName: name
            }, done);
        }, callback);
    });
};

module.exports = DdbLocal;
