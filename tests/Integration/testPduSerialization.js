var shorty = require('../../lib/shorty'),
    child_process = require('child_process');

(function() {
    'use strict';
    
    var createDeliverMessage = function() {
        var message = new Buffer('This is a test');
    
        return {
            destination_addr: new Buffer('15555555555'),
            dest_addr_ton: 0,
            source_addr: new Buffer('15555555554'),
            source_addr_ton: 0,
            data_coding: 0x03,
            short_message: message,
            sm_length: message.length
        };
    };
    
    module.exports = {
        testJsonSerialization: function(test) {
            var originalMessage = createDeliverMessage(),
                writer = shorty.getPduWriter(),
                message = JSON.stringify(writer.serialize(originalMessage)),
                decodedMessage = writer.unserialize(JSON.parse(message));
            
            for(var key in originalMessage) {
                var value = originalMessage[key];
                
                if(Buffer.isBuffer(value)) {
                    test.ok(Buffer.isBuffer(decodedMessage[key]));
                    if(Buffer.isBuffer(decodedMessage[key])) {
                        test.equal(value.toString('base64'), decodedMessage[key].toString('base64'));
                    }
                }
            }
            
            test.done();
        },
        testIpcSerialization: function(test) {
            var child = child_process.fork(__dirname + '/testPduSerialization/ChildProcess'),
                originalMessage = createDeliverMessage(),
                //port = Math.floor(Math.random() * (32768 - 3000) + 3000),
                port = 20054,
                server,
                failureTimeout = setTimeout(function() {
                    server.stop();
                    child.kill();
                    test.ok(false, 'Test did not complete in time');
                    test.done();
                }, 5000);
            
            child.on('message', function(message) {
                var writer = shorty.getPduWriter(),
                    decodedMessage = writer.unserialize(message);
                
                for(var key in originalMessage) {
                    var value = originalMessage[key];
                    
                    if(Buffer.isBuffer(value)) {
                        test.ok(Buffer.isBuffer(decodedMessage[key]));
                        if(Buffer.isBuffer(decodedMessage[key])) {
                            test.equal(value.toString('base64'), decodedMessage[key].toString('base64'));
                        }
                    }
                }

                child.kill();
                server.stop();
                
                clearTimeout(failureTimeout);
                test.done();
            });
            
            server = shorty.createServer({
                'smpp': {
                    'mode': 'server',
                    'host': 'localhost',
                    'port': port,
                    'system_id': 'nodeunit',
                    'system_type': 'nodeunit',
                    'version': '3.4',
                    'addr_ton': 0,
                    'addr_npi': 1,
                    'addr_range': '',
                    'timeout': 15,
                    'strict': 1
                }
            });
            
            server.on('bindSuccess', function(pdu) {
                server.deliverMessage('nodeunit_worker', originalMessage);
            });
            
            server.start();
            
            child.send({
                command: 'connect',
                params: {
                    'smpp': {
                        'mode': 'receiver',
                        'host': 'localhost',
                        'port': port,
                        'system_id': 'nodeunit_worker',
                        'password': 'nodeunit',
                        'system_type': 'SHORTY',
                        'version': '3.4',
                        'addr_ton': 0,
                        'addr_npi': 1,
                        'addr_range': '',
                        'timeout': 30,
                        'strict': 1,
                        'client_keepalive': true,
                        'client_reconnect_interval': 2500
                    }
                }
            });
        }
    };
}) ();
