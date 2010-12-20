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

var client = require('./client').client,
    server = require('./server').server,
    fs     = require('fs');

exports.loadConfig = function(file) {
    try {
        config = JSON.parse(fs.readFileSync(file).toString());
    } catch (ex) {
        console.log('Error loading config file: ' + ex);
        process.exit(1);
    }
    return config;
};

exports.createClient = function(configFile) {
    config = exports.loadConfig(configFile);
    DEBUG = config.debug;
    return new client(config.smpp);
};

exports.createServer = function(configFile) {
    config = exports.loadConfig(configFile);
    DEBUG = config.debug;
    return new server(config.smpp);
};
