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
 * @package    server
 */

'use strict';

const EventEmitter = require('events').EventEmitter;
const net = require('net');
const tls = require('tls');
const PduParser = require('./pdu-parser');
const PduWriter = require('./pdu-writer');
const Protocol = require('./protocol');
const ServerConnection = require('./server-connection');

class Server extends EventEmitter {
    constructor(config, smppDefs) {
        super();
        /**
         * @public
         * @type {boolean}
         */
        this.started = false;
        this._config = config;
        this._server = {};
        this._clients = [];
        this._connections = 0;
        this._smppDefs = smppDefs;
        // share parser and writer between all the connections
        this._pduWriter = new PduWriter(this._smppDefs);
        this._pduParser = new PduParser(this._smppDefs);
    }

    listen() {
        // create the server object with a method that listens for incoming connections
        this._server = (this._config.secure ? tls : net).createServer(this._config, this._onConnection.bind(this));

        // start listening on the _config port/host; the callback here is just called when
        // the server is bound
        this._server.listen(this._config.port, this._config.host, () => {
            // if ( DEBUG ) { console.log('listening on ' + self._config.host + ':' + self._config.port); }
        });

        // handle errors
        this._server.on('error', this._onServerError.bind(this));

        // we know we've started; don't remember what this was used for
        this.started = true;
    }

    stop(callback) {
        for (const key in this._clients) {
            if (this._clients[key] !== undefined) {
                this._clients[key].unbind();
            }
        }

        this.server.close(callback);
    }

    /*
     *  Used as a hook to deliver inbound messages to a client
     */
    deliverMessage(systemId, params, optionalParams) {
        for (const key in this._clients) {
            // IMPORTANT: if two clients are connected with the same system id, the message
            // will TYPICALLY be delivered to the least-recently connected (but not always!)
            if (this._clients[key].systemId === systemId) {
                return this._clients[key].deliverMessage(params, optionalParams);
            }
        }

        return false;
    }

    _onConnection(socket) {
        const protocol = new Protocol(socket, this._pduParser, this._pduWriter);
        const serverConnection = new ServerConnection(protocol, this._smppDefs, this._config);

        serverConnection.connectionId = this._connections++;
        serverConnection.on('state CLOSED', () => {
            delete this._clients[serverConnection.connectionId];
        });

        this.emit('connection', serverConnection);
        serverConnection.init();

        this._clients[serverConnection.connectionId] = serverConnection;
    }

    _onServerError() {
        // TODO this is not acceptable, add proper handling
        // if ( DEBUG ) { console.log(sys.inspect(e)); }
    }
}

module.exports = Server;
