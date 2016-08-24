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

const net = require('net');
const tls = require('tls');
const serverConnection = require('./server-connection');

class Server {
    constructor(config, smppDefs) {
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

        this._eventListeners = [];
        this.on('newListener', (event, listener) => this._eventListeners.push({ event, listener }));
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

    stop() {
        for (const key in this._clients) {
            if (this._clients[key] !== undefined) {
                this._clients[key].unbind();
            }
        }

        this.server.close();
    }

    /*
     *  Used as a hook to deliver inbound messages to a client
     */
    deliverMessage(systemId, params, optionalParams) {
        for (const key in this._clients) {
            // IMPORTANT: if two clients are connected with the same system id, the message
            // will TYPICALLY be delivered to the least-recently connected (but not always!)
            if (this._clients[key].system_id === systemId) {
                return this._clients[key].deliverMessage(params, optionalParams);
            }
        }

        return false;
    }

    _onConnection(socket) {
        // add a client and keep track of it
        const myClient = serverConnection.fromSocket(socket, this, this._onClientClose.bind(this), this._smppDefs);
        myClient.connection_id = this._connections++;

        for (let i = 0; i < this._eventListeners.length; i++) {
            myClient.on(this._eventListeners[i].event, this._eventListeners[i].listener);
        }

        this._clients[myClient.connection_id] = myClient;
    }

    _onServerError() {
        // noop
        // if ( DEBUG ) { console.log(sys.inspect(e)); }
    }

    _onClientClose(id) {
        // if (DEBUG) { console.log('connection closed'); }
        // const myClient = self.clients[id];
        delete this._clients[id];
        // myClient._socket.destroy();
    }
}

module.exports = Server;
