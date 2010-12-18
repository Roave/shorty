#!/usr/local/bin/node
/**
 * This file is part of Shorty.
 *
 * Shorty is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; version 3 of the License.
 *
 * Shorty is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Shorty.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @category   shorty
 * @license    http://www.gnu.org/licenses/gpl-3.0.txt GPL
 * @copyright  Copyright 2010 Evan Coury (http://www.Evan.pro/)
 * @package    smpp
 */
var net     = require('net'),
    fs      = require('fs'),
    sys     = require('sys');

try {
    config = JSON.parse(fs.readFileSync('config.json').toString());
    DEBUG = config.debug;
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

    self.commands = {};                               // Use commands to look up by command name
    self.command_ids = {                              // Use command_ids to look up by ID
        0x80000000: 'generic_nack',
        0x00000001: 'bind_receiver',
        0x80000001: 'bind_receiver_resp',
        0x00000002: 'bind_transmitter',
        0x80000002: 'bind_transmitter_resp',
        0x00000003: 'query_sm',
        0x80000003: 'query_sm_resp',
        0x00000004: 'submit_sm',
        0x80000004: 'submit_sm_resp',
        0x00000005: 'deliver_sm',
        0x80000005: 'deliver_sm_resp',
        0x00000006: 'unbind',
        0x80000006: 'unbind_resp',
        0x00000007: 'replace_sm',
        0x80000007: 'replace_sm_resp',
        0x00000008: 'cancel_sm',
        0x80000008: 'cancel_sm_resp',
        0x00000009: 'bind_transceiver',
        0x80000009: 'bind_transceiver_resp',
        0x0000000B: 'outbind',
        0x00000015: 'enquire_link',
        0x80000015: 'enquire_link_resp',
        0x00000021: 'submit_multi',
        0x80000021: 'submit_multi_resp',
        0x00000102: 'alert_notification',
        0x00000103: 'data_sm',
        0x80000103: 'data_sm_resp'
    };

    // Reverse coomand_ids into commands so we can have easy lookup either way!
    for (var command_id in self.command_ids) {
        self.commands[ self.command_ids[command_id] ] = command_id;
    }

    self.connect = function() {
        if ( DEBUG ) { console.log('Connecting to tcp://'+self.config.host+':'+self.config.port); }
        self.socket = net.createConnection(self.config.port, self.config.host);

        self.socket.on('connect', function() {
            if ( DEBUG ) { console.log('Socket connected... Attempting bind...'); }
            self.bind();
        });
        self.socket.on('data', function(data) {
            if ( DEBUG ) { console.log('Incoming data...'); }
            pdu = self.readPdu(data);

            self.sequence_number = pdu['sequence_number'];

            switch (pdu['command_id']) {
                case 0x0000005:
                    if (DEBUG) { console.log('deliver_sm received; processing message'); }
                    message = self.deliver_sm_resp(pdu);
                    sys.puts(sys.inspect(messsage));
                    break;
                case 0x00000015:
                    if (DEBUG) { console.log('enquire_link_resp sent; seq: ' + self.sequence_number); }
                    self.enquire_link_resp();
                    break;
                default:
                    break;
            }
        });
    };

    /**
     * @todo sm_submit needs to send a unique sequence number
     */
    self.sm_submit = function(from, to, message) {
        pdu = self.pack(
                'a1cca' + (from.length + 1) + 'cca' + (to.length + 1) + 'ccca1a1ccccca' + (message.length),
                "", 0, 0, from,
                0, 0, to, 0, 0,
                0, "", "", 0, 0,
                3, 0,
                message.length.toString(),
                message.toString()
        );

        self.sendPdu(pdu, 0x00000004);
    }

    self.deliver_sm_resp = function(pdu) {
        body = {};
        body['from'] = pdu['body'].substr(3,11);
        body['to'] = pdu['body'].substr(17,11);
        body['length'] = pdu['body'].charCodeAt(38);
        body['message'] = pdu['body'].substr(39, body['length']);
        body['sequence_num'] = pdu['sequence_number'];

        newpdu = self.pack('C', "\0");
        self.sendPdu(newpdu, 0x80000005, body['sequence_num']);

        return body;
    }

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

    self.enquire_link_resp = function() {
        self.sendHeader(0x80000015);
    };

    self.sendHeader = function(command_id, sequence_number) {
        if (sequence_number == undefined) {
            sequence_number = self.sequence_number;
        }
        header = self.pack('NNNN', 16, command_id, 0, sequence_number);
        self.socket.write(header, 'binary');
    };

    self.sendPdu = function(pdu, command_id, sequence_number) {
        if (sequence_number == undefined) {
            sequence_number = self.sequence_number;
        }
        header = self.pack('NNNN', pdu.length + 16, command_id, 0, sequence_number);
        self.socket.write(header+pdu, 'binary');
    };

    self.readPdu = function(pdu) {
            dataStr = pdu.toString('binary');
            pdu = {};
            pdu['length'] = ((dataStr.charCodeAt(0) & 0xFF) << 24) +
                            ((dataStr.charCodeAt(1) & 0xFF) << 16) +
                            ((dataStr.charCodeAt(2) & 0xFF) << 8) +
                            ((dataStr.charCodeAt(3) & 0xFF));
            pdu['command_id'] = ((dataStr.charCodeAt(4) & 0xFF) << 24) +
                            ((dataStr.charCodeAt(5) & 0xFF) << 16) +
                            ((dataStr.charCodeAt(6) & 0xFF) << 8) +
                            ((dataStr.charCodeAt(7) & 0xFF));
            pdu['command_status'] = ((dataStr.charCodeAt(8) & 0xFF) << 24) +
                            ((dataStr.charCodeAt(9) & 0xFF) << 16) +
                            ((dataStr.charCodeAt(10) & 0xFF) << 8) +
                            ((dataStr.charCodeAt(11) & 0xFF));
            pdu['sequence_number'] = ((dataStr.charCodeAt(12) & 0xFF) << 24) +
                            ((dataStr.charCodeAt(13) & 0xFF) << 16) +
                            ((dataStr.charCodeAt(14) & 0xFF) << 8) +
                            ((dataStr.charCodeAt(15) & 0xFF));
            pdu['body'] = '';
            if((pdu['length'] - 16) > 0){
                for (i = 16; i < pdu['length']; i++) {
                    pdu['body'] += dataStr.charAt(i);
                }
            }
            if ( DEBUG ) { console.log('Parsing PDU...'); console.log(pdu); }
            return pdu;
    }

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
