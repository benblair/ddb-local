# ddb-local
A thin wrapper around AWS's [DynamoDBLocal](http://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Tools.DynamoDBLocal.html)
to make using it in unit tests a bit simpler.

[![NPM Version][npm-image]][npm-url]
[![Build][circleci-image]][circleci-url]

## Install

```
npm install --save ddb-local
```

## Usage

#### Example usage with Mocha

Set an env var for your DynamoDB endpoint in your package.json test script

```JSON
  "scripts": {
    "test": "NODE_ENV=test AWS_DDB_ENDPOINT=http://localhost:3547 mocha --timeout 30000"
  },
```

Start up DdbLocal before running your application tests, and shut it down after.

```js

var DdbLocal = require('ddb-local');

describe('ddb', function () {
    var ddblocal = new DdbLocal();
    
    before(function (done) {
        ddblocal.start(done);
    }
    
    describe('application tests...');
    
    after(function (done) {
        ddblocal.stop(done);
    });
});

```

Then wihin your application code, any time you create a new DynamoDB client,
set the endpoint if the env var is set.

```js
    var dynamoParams = {
        apiVersion: '2012-08-10',
        endpoint: process.env.AWS_DDB_ENDPOINT
    };
    var dynamo = new AWS.DynamoDB(dynamoParams);
```

Now when you run `$ npm test` your application will be using DynamoDBLocal 
instead of the real DynamoDB. Keep in mind that if your application code 
assumes your DynamoDB tables already exist, you'll have to create them 
in your test setup.



## Options

ddb-local supports a few configuration options via both env var and constructor
params `new DdbLocal(options)`

- Download path for the DynamoDBLocal jar file. Set with `options.jarDir` or 
by setting `DEFAULT_DOWNLOAD_PATH` env var
- Port for DynamoDBLocal to listen on. Set with `options.port` or `DDB_PORT`
- Endpoint for DynamoDBLocal to use. Overrides the Port option. Set with `AWS_DDB_ENDPOINT`

#### Self-contained Example (no test framework)

```js
var AWS = require('aws-sdk');
var DdbLocal = require('ddb-local');
var assert = require('assert');

var localdb = new DdbLocal();
localdb.start(function (err) {
    assert.ifError(err);
    // Now use DynamoDB normally, just set the endpoint to localdb.endpoint
    var AWS = require('aws-sdk');
    
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
    
    // Stop LocalDB when you're done
    localdb.stop();
});
```
[npm-image]: https://img.shields.io/npm/v/ddb-local.svg
[npm-url]: https://npmjs.org/package/ddb-local
[circleci-image]: https://img.shields.io/circleci/project/benblair/ddb-local.svg
[circleci-url]: https://circleci.com/gh/benblair/ddb-local
