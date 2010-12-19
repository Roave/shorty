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
 * @package    client
 */
var net     = require('net'),
    sys     = require('sys'),
    smpp    = require('./smpp');

exports.client = function(config) {
    var self = this;
    self.config = config;
    self.socket = {};
    self.sequence_number = 1;
    self.bound = false;

    self.connect = function() {
        if ( DEBUG ) { console.log('Connecting to tcp://'+self.config.host+':'+self.config.port); }
        self.socket = net.createConnection(self.config.port, self.config.host);

        self.socket.on('connect', function() {
            if ( DEBUG ) { console.log('Socket connected... Attempting bind...'); }
            self.bind();
        });
        self.socket.on('data', function(data) {
            pdu = smpp.readPdu(data);
            if ( DEBUG ) { console.log('Incoming PDU: ' + smpp.command_ids[pdu['command_id']]); }

            switch (pdu['command_id']) {
                case 0x0000005:
                    if (DEBUG) { console.log('deliver_sm received; processing message'); }
                    message = self.deliver_sm_resp(pdu);
                    sys.puts(sys.inspect(message));
                    break;
                case 0x00000015:
                    if (DEBUG) { console.log('enquire_link_resp sent; seq: ' + pdu['sequence_number']); }
                    self.enquire_link_resp(pdu);
                    break;
                case 0x80000009:
                    if (DEBUG) { console.log('bind_transceiver successful'); }
                    self.bound = true;
                    self.sequence_number++;
                    return;
                default:
                    break;
            }
        });
    };

    /**
     * @todo sm_submit needs to send a unique sequence number
     */
    self.sm_submit = function(from, to, message) {
        pdu = smpp.pack(
                'a1cca' + (from.length + 1) + 'cca' + (to.length + 1) + 'ccca1a1ccccca' + (message.length),
                "",     //service_type
                0,      //source_addr_ton
                0,      //source_addr_npi
                from,   //source_addr
                0,      //dest_addr_ton
                0,      //dest_addr_npi
                to,     //destination_addr
                0,      //esm_class
                0,      //protocol_id
                0,      //priority_flag
                "",     //schedule_delivery_time
                "",     //validity_period
                0,      //registered_delivery
                0,      //replace_if_present_flag
                3,      //data_coding
                0,      //sm_default_msg_id
                message.length.toString(),
                message.toString()
        );

        seqn = self.sequence_number++;
        self.sendPdu(pdu, 0x00000004);
        return seqn;
    }

    self.deliver_sm_resp = function(pdu) {
        body = {};
        body['from'] = pdu['body'].toString('ascii', 3, 14);
        body['to'] = pdu['body'].toString('ascii', 17, 28);
        body['length'] = pdu['body'][38];
        body['message'] = pdu['body'].toString('ascii', 39, pdu['body'].length);
        body['sequence_number'] = pdu['sequence_number'];
        console.log(body);

        // The body must be set to NULL per SMPPv3.4
        newpdu = smpp.pack('C', "\0");
        self.sendPdu(newpdu, 0x80000005, body['sequence_number']);

        return body;
    }

    self.enquire_link_resp = function(oldpdu) {
        //enquire_link* only sends an SMPP header
        self.sendPdu("", 0x80000015, oldpdu['sequence_number']);
    };

    self.bind = function() {
            pdu = smpp.pack(
                    'a' + (self.config.system_id.length + 1) +
                    'a' + (self.config.password.length + 1) +
                    'a' + (self.config.system_type.length + 1) +
                    'CCCa' + (self.config.addr_range.length + 1),
                    self.config.system_id, self.config.password, self.config.system_type,
                    self.config.version, self.config.addr_ton, self.config.addr_npi,
                    self.config.addr_range);
            self.sendPdu(pdu, 0x00000009);
    };

    self.sendPdu = function(pdu, command_id, sequence_number) {
        if (sequence_number == undefined) {
            sequence_number = self.sequence_number;
        }
        header = smpp.pack('NNNN', pdu.length + 16, command_id, 0, sequence_number);
        if ( DEBUG ) { console.log('Outgoing PDU: ' + smpp.command_ids[command_id]); }
        self.socket.write(smpp.createBuffer(header+pdu));
    };
};
