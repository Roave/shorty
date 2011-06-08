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
 * @package    models
 */

var sys = require('sys');

exports.pack = function(format) {

    var i, j, repeater, packed, formatChr, chrj, b, arg,
        bufferOffset = 0,
        bufferLength = 0,
        argi = 1;

    for (i = 0; i < format.length; i++) {
        switch(format.charAt(i)) {
            case 'A':
            case 'a':
            case 'C':
            case 'c':
            case 'U':
                // figure out the repeater value
                repeater = '';
                while (format.charAt(i+1).match(/^\d$/)) {
                    repeater = repeater + format.charAt(i+1);
                    i++;
                }

                if (repeater.length === 0) {
                    repeater = 1;
                } else {
                    repeater = parseInt(repeater, 10);
                }

                bufferLength += repeater;

                break;
            case 'N':
                bufferLength += 4;
                break;
        }
    }

    packed = new Buffer(bufferLength);

    for (i = 0; i < format.length; i++) {
        formatChr = format.charAt(i);
        repeater = '';
        
        switch (formatChr) {
            case 'A':
                repeater = '';
                while(format.charAt(i+1).match(/^\d$/)) {
                    repeater = repeater + format.charAt(i+1);
                    i++;
                }

                if (repeater.length === 0) {
                    repeater = 1;
                } else {
                    repeater = parseInt(repeater, 10);
                }

                for (j = 0; j < repeater; j++) {
                    chrj = arguments[argi].charAt(j);

                    if (j >= arguments[argi].length) {
                        packed.write(0x20, bufferOffset);
                        bufferOffset += 1;
                    } else {
                        packed.write(chrj, bufferOffset);
                        bufferOffset += Buffer.byteLength(chrj);
                    }
                }
                
                argi++;
                break;

            case 'a':
                repeater = '';
                while(format.charAt(i+1).match(/^\d$/)) {
                    repeater = repeater + format.charAt(i+1);
                    i++;
                }

                if (repeater.length === 0) {
                    repeater = 1;
                } else {
                    repeater = parseInt(repeater, 10);
                }

                for (j = 0; j <= repeater; j++) {
                    chrj = arguments[argi].charAt(j);

                    if (j >= arguments[argi].length) {
                        packed.write("\0", bufferOffset);
                        bufferOffset += 1;

                        // added this break so that we don't write extra null
                        // characters
                        break;
                    } else {
                        packed.write(chrj, bufferOffset);
                        bufferOffset += Buffer.byteLength(chrj);
                    }
                }
                
                argi++;
                break;


            // THIS IS A NON-STANDARD FORMAT used for un-padded strings (i.e.
            // strings that are not padded by a space or a null byte
            case 'U':
                repeater = '';
                while(format.charAt(i+1).match(/^\d$/)) {
                    repeater = repeater + format.charAt(i+1);
                    i++;
                }

                if (repeater.length === 0) {
                    repeater = 1;
                } else {
                    repeater = parseInt(repeater, 10);
                }

                for (j = 0; j <= repeater; j++) {
                    chrj = arguments[argi].charAt(j);

                    if (j >= arguments[argi].length) {
                        break;
                    }

                    packed.write(chrj, bufferOffset);
                    bufferOffset += Buffer.byteLength(chrj);
                }

                argi++;
                break;

            case 'C':
            case 'c':
                repeater = '';
                while(format.charAt(i+1).match(/^\d$/)) {
                    repeater = repeater + format.charAt(i+1);
                    i++;
                }

                if (repeater.length === 0) {
                    repeater = 1;
                } else {
                    repeater = parseInt(repeater, 10);
                }

                for (j = 0; j < repeater; j++) {
                    packed[bufferOffset] = arguments[argi];
                    bufferOffset += Buffer.byteLength(String.fromCharCode(arguments[argi]));

                    argi++;
                }
                break;

            case 'N':
                repeater = '';
                while(format.charAt(i+1).match(/^\d$/)) {
                    repeater = repeater + format.charAt(i+1);
                    i++;
                }

                if (repeater.length === 0) {
                    repeater = 1;
                } else {
                    repeater = parseInt(repeater, 10);
                }

                arg = arguments[argi];

                for (j = 0; j < repeater; j++) {
                    b = new Buffer([(arg >> 24) & 255, (arg >> 16) & 255, (arg >> 8) & 255, arg & 255]);
                    b.copy(packed, bufferOffset, 0);
                    bufferOffset += 4;

                    argi++;
                    arg = arguments[argi];
                }
                break;
        }
    }

    return packed;
};
