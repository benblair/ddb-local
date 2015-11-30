var assert = require('assert');
var DdbLocal = require('../');

// Set the usual DDB env vars so they don't have to be explicit
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || 'key';
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || 'secret';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-test-1';

describe('LocalDdb', function () {
    var localdb = new DdbLocal();
    
    describe('#isRunning', function() {
        it('should return false before being started.', function (done) {
            localdb.isRunning(function(err, isRunning) {
                assert.ifError(err);
                assert.equal(false, isRunning);
                done();
            });
        });
    });
    describe('#start', function () {
        it('should download and start DynamoDBLocal', function (done) {
            localdb.start(function (err) {
                assert.ifError(err);
                localdb.isRunning(function(err, isRunning) {
                    assert.ifError(err);
                    assert.equal(true, isRunning);
                    done();
                });
            });
        });
    });
    describe('#endpoint', function () {
        it('should allow creating a new table', function (done) {
            
            var AWS = require('aws-sdk');
            
            localdb.start(function (err) {
                assert.ifError(err);
                var dynamoParams = {
                    apiVersion: '2012-08-10',
                    endpoint: localdb.endpoint
                };
                var client = new AWS.DynamoDB(dynamoParams);
                var tableParams = {
                    TableName: 'test',
            		AttributeDefinitions: [
            			{
            				AttributeName: 'id',
            				AttributeType: 'S'
            			}
            		],
            		KeySchema: [
            			{
            				AttributeName: 'id',
            				KeyType: 'HASH'
            			}
            		],
            		ProvisionedThroughput: {
            			ReadCapacityUnits: 5,
            			WriteCapacityUnits: 5
            		}
                };
                client.createTable(tableParams, function (err, result) {
                    assert.ifError(err);
                    assert.equal(result.TableDescription.TableName, tableParams.TableName);
                    done();
                });
            });
        });
    });
    describe('#stop', function () {
        it('should stop DynamoDBLocal', function (done) {
            localdb.stop(function (err) {
                console.log('stopped');
                assert.ifError(err);
                localdb.isRunning(function(err, isRunning) {
                    assert.ifError(err);
                    assert.equal(false, isRunning);
                    done();
                });
            });
        });
    });
});
