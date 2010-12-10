#!/usr/local/bin/node
var net     = require('net'),
    fs      = require('fs');

try {
    config = JSON.parse(fs.readFileSync('config.json').toString());
    DEBUG = config.debug;
    console.log(config);
} catch (ex) {
    util.puts('Error loading config file: ' + ex);
    process.exit(1);
}

smpp = new shorty(config.smpp);
smpp.connect();

function shorty(config) {
    var self = this;
    self.config = config;
    self.socket = {};
    self.sequence_number = 1;

    self.connect = function() {
        if ( DEBUG ) { console.log('Connecting to tcp://'+self.config.host+':'+self.config.port); }
        self.socket = net.createConnection(self.config.port, self.config.host);

        self.socket.on('connect', function() {
            console.log('Socket connected... Attempting bind...');
            self.bind();
        });
        self.socket.on('data', function() {
            console.log('Incoming data...');
        });
    };

    self.bind = function() {
            pdu = self.pack(
                    'a' + (self.config.system_id.length + 1) +
                    'a' + (self.config.password.length + 1) +
                    'a' + (self.config.system_type.length + 1) +
                    'CCCa' + (self.config.addr_range.length + 1),
                    self.config.system_id, self.config.password, self.config.system_type,
                    self.config.version, self.config.addr_ton, self.config.addr_npi,
                    self.config.addr_range);
            self.sendPdu(pdu, 0x00000009);
    };

    self.sendPdu = function(pdu, command_id) {
            header = self.pack('NNNN', pdu.length + 16, command_id, 0, self.sequence_number);
            console.log(self.socket.write(header+pdu));
    };

    self.pack = function(format) {
        var packed = '';
        var argi = 1;
        for (i = 0; i < format.length; i++) {
            var chr = format.charAt(i);
            var arg = arguments[argi];
            var num = '';
            switch (chr) {
                case 'A':
                    num = '';
                    while (format.charAt(i+1).match(/^\d$/)){
                        num = num + format.charAt(i+1);
                        i++;
                    }
                    if (num.length == 0) {
                        num = 1;
                    }
                    num = parseInt(num);
                    for (j = 0; j <= num; j++) {
                        var chrj = arg.charAt(j);
                        if (j > arg.length) {
                            packed += ' ';
                        } else {
                            packed += chrj;
                        }
                    }
                    argi++;
                    break;
                case 'a':
                    num = '';
                    while (format.charAt(i+1).match(/^\d$/)){
                        num = num + format.charAt(i+1);
                        i++;
                    }
                    if (num.length == 0) {
                        num = 1;
                    }
                    num = parseInt(num);
                    for (j = 0; j <= num; j++) {
                        var chrj = arg.charAt(j);
                        if (j > arg.length) {
                            packed += "\0";
                        } else {
                            packed += chrj;
                        }
                    }
                    argi++;
                    break;
                case 'C':
                case 'c':
                    num = '';
                    while (format.charAt(i+1).match(/^\d$/)){
                        num = num + format.charAt(i+1);
                        i++;
                    }
                    if (num.length == 0) {
                        num = 1;
                    }
                    num = parseInt(num);
                    for (j = 1; j <= num; j++) {
                        packed += String.fromCharCode(arg);
                        argi++;
                        var arg = arguments[argi];
                    }
                    break;
                case 'N':
                    num = '';
                    while (format.charAt(i+1).match(/^\d$/)){
                        num = num + format.charAt(i+1);
                        i++;
                    }
                    if (num.length == 0) {
                        num = 1;
                    }
                    num = parseInt(num);
                    for (j = 1; j <= num; j++) {
                        packed += String.fromCharCode((arg >> 24) & 255, (arg >> 16) & 255, (arg >> 8) & 255, arg & 255);
                        argi++;
                        var arg = arguments[argi];
                    }
                    break;
            }
        }
        return packed;
    };
}

