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
 * @package    tests
 */
var shorty = require('../lib/shorty'),
    fs     = require('fs');

exports.testSmpp = function(t) {
    t.expect(1); // expect one assetion for this test
    try {
        config = JSON.parse(fs.readFileSync('config.json').toString());
    } catch (ex) {
        console.log('Error loading config file: ' + ex);
        process.exit(1);
    }
    shortyClient = shorty.createClient(config);
    t.ok(shortyClient.commands['generic_nack'] == 0x80000000, "Testing that the commands dictionary was built");
    t.done();
}
