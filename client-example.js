#!/usr/bin/env node
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
 * @package    examples
 */

var shorty = require('./lib/shorty'),
    sys    = require('util');




/**
 * Create the shorty client object.
 * 
 * Alternatively, you could read in your own config file, then pass in an object
 * with properties matching the one in config.dist.json instead of a filename
 */
var shortyClient = shorty.createClient('config.json');

function initialize(connection) {
  /**
   * The submit_sm_resp is emitted when the server sends a submit_sm_resp in
   * response to a submit_sm. It is not aware of status or any error codes. It's
   * up to the application to figure out what to do with those.
   */
  connection.on('submit_sm_resp', function (pdu) {
    console.log('sms marked as sent: ' + pdu.sequence_number);
  });

  /**
   * The bindSuccess event is emitted after a bind_x_resp is received with an
   * ESME_ROK status. It is not until this event is emitted that a client can be
   * considered to be properly bound to an SMPP server.
   */
  connection.on('bindSuccess', function(pdu) {
    console.log('bind successful');
  });

  /**
   * This event is emitted any time a bind_x_resp is received with a status other
   * than ESME_ROK. Although this event indicates some sort of failure, it is
   * unaware of the reasons for failure. It is up to the application to read the
   * status code from the returned pdu object and determine the problem.
   */
  connection.on('bindFailure', function(pdu) {
    console.log('bind failed');
  });

  /**
   * This event is emitted when the server sends an unbind PDU requesting that the
   * client unbind. Currently, shorty will automatically comply with any unbind
   * requests and send an unbind_resp.
   */
  connection.on('unbind', function(pdu) {
    console.log('unbinding from server');
  });

  /**
   * This event is emitted when the server sends an unbind_resp, acknowledging
   * that the client's unbind command.
   */
  connection.on('unbind_resp', function(pdu) {
    console.log('unbind confirmed');
  });

  /**
   * This event is emitted (TODO bug: sometimes more than once) when the client is
   * disconnected from the server. This will always happen after an unbind, but
   * can also happen after certain errors.
   */
  connection.on('disconnect', function() {
    console.log('disconnected');
  });

  /**
   * This event is emitted when the server sends a deliver_sm. All that is passed
   * to the application is the parsed PDU. All strings will be left as buffers,
   * and it is up to the application to determine the proper encoding.
   *
   * Typically, ASCII is appropriate for most fields. The short_message field
   * should be decoded according to the data_coding field. If node.js doesn't
   * support the encoding specified, the node-iconv library can be very helpful
   * (https://github.com/bnoordhuis/node-iconv).
   */
  connection.on('deliver_sm', function(pdu) {
    console.log(pdu.source_addr.toString('utf8') + ' ' + pdu.destination_addr.toString('utf8') + ' ' + pdu.short_message.toString('utf8'));
  });

  /**
   * Connect the client to the server!
   */
  connection.connect();

  // Open stdin (only particularly useful for this example code)
  process.openStdin();

  // called every time the user writes a line on stdin
  process.stdin.on('data', function(chunk) {
    var line, parts, i, message, id;

    // buffer to a string
    line = chunk.toString();

    // remove the newline at the end
    line = line.substr(0, line.length - 1);

    // split by spaces
    parts = line.split(" ");

    // put the message back together
    message = "";
    for (i = 2; i < parts.length; i++) {
      message += parts[i] + " ";
    }

    /**
     * shortyClient.sendMessage accepts two object parameters:
     * 1. a list of required SMPP fields (named as they are in the SMPP v3.4
     *      manual). Shorty provides some sane defaults (see
     *      lib/smpp-definitions.js), but it is generally a good idea to supply
     *      any requisite data.
     *
     * 2. a list of optional SMPP fields (again, named as they are in the spec).
     *      Shorty does not add any optional fields by default.
     */
    id = connection.sendMessage({
      souce_addr_ton: 0x01,
      source_addr: parts[0],
      dest_addr_ton: 0x01,
      destination_addr: parts[1],
      data_coding: 0x03,
      short_message: message
    }, {
      user_message_reference: 102
    });
  });
}

var sighandle = function() {
    process.stdin.end();
    for (var i = 0; i < shortyClient.connections.length; i++) {
      shortyClient.connections[i].unbind();
    }
};

process.on('exit', sighandle);

for (var i = 0; i < shortyClient.connections.length; i++) {
  initialize(shortyClient.connections[i]);
}
