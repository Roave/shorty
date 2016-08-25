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
 * @package    shorty
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const PduParser = require('./pdu-parser');
const PduWriter = require('./pdu-writer');
const shorty = exports;
const smpp = require('./smpp-definitions');
const Client = require('./client');
const Server = require('./server');

exports.Client = Client;
exports.Server = Server;

exports.loadConfig = function loadConfig(file) {
    let config;

    try {
        config = JSON.parse(fs.readFileSync(file).toString());
    } catch (e) {
        console.error(`Error loading config file: ${e}`);
        process.exit(1);
    }

    // we're apparently not allowed to use hexadecimal in _config files
    // and the corresponding decimal number (52) isn't particularly descriptive
    if (config.smpp.version === "3.4") {
        config.smpp.version = 0x34;
    }

    return config;
};

exports.createClient = function createClient(config) {
    if (typeof config === "string") {
        config = exports.loadConfig(config);
    }

    return new Client(config.smpp, shorty.getSmppDefinitions());
};

exports.createServer = function createServer(config) {
    if (typeof config === "string") {
        config = exports.loadConfig(config);
    }

    return new Server(config.smpp, shorty.getSmppDefinitions());
};

exports.addVendorCommandStatus = function addVendorCommandStatus(definitions) {
    assert(typeof definitions === "object", "Status codes must be provided as an object");

    for (const cmdStatus in definitions) {
        if (!definitions.hasOwnProperty(cmdStatus)) {
            continue;
        }
        assert(definitions[cmdStatus].hasOwnProperty('value'), "Status codes must have a defined value");
        assert(definitions[cmdStatus].hasOwnProperty('description'), "Status codes must have a description");
        assert(typeof definitions[cmdStatus].value === "number", "Status code value must be a number");

        smpp.command_status[cmdStatus] = definitions[cmdStatus];
        smpp.command_status_codes[definitions[cmdStatus].value] = cmdStatus;
    }
};

exports.addVendorOptionalParams = function (definitions) {
    assert(typeof definitions === "object", "Optional params must be provided as an object");

    for (const optParam in definitions) {
        if (!definitions.hasOwnProperty(optParam)) {
            continue;
        }
        assert(definitions[optParam].hasOwnProperty('tag'), "Optional params must have a tag");
        assert(definitions[optParam].hasOwnProperty('type'), "Optional params must have a data type");

        smpp.optional_params[optParam] = definitions[optParam];
        smpp.optional_param_tags[definitions[optParam].tag] = optParam;
    }
};

exports.getSmppDefinitions = function () {
    return smpp;
};

exports.PduParser = PduParser;
exports.PduWriter = PduWriter;
