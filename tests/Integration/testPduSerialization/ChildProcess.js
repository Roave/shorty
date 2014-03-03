var shorty = require('../../../lib/shorty');

(function() {
    'use strict';
    
    var client;
    
    process.on('message', function(processMessage) {
        switch(processMessage.command) {
            case 'connect':
                client = shorty.createClient(processMessage.params);
                client.on('bindSuccess', function() {
                    console.log('Worker connected');
                });
                client.on('bindFailure', function() {
                    console.log('Worker failed to connect');
                });
                client.on('deliver_sm', function(pdu) {
                    var writer = shorty.getPduWriter();
                
                    process.send(writer.serialize(pdu));
                });
                client.connect();
                break;
        }
    });
}) ();
