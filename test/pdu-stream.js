'use strict';

const describe = require('mocha').describe;
const expect = require('chai').expect;
const it = require('mocha').it;
const PduParsingStream = require('../lib/pdu-stream').ParsingStream;
const PduSerializingStream = require('../lib/pdu-stream').SerializingStream;
const PduParser = require('../lib/pdu-parser');
const PduWriter = require('../lib/pdu-writer');
const smppDefs = require('../lib/smpp-definitions');
const testPdus = require('./_assets/pdu');


// TODO cleanup tests once rest of the shorty is updated
// TODO add more tests to cover most use cases
describe('PDU transform streams', () => {
    describe('Parsing stream', () => {
        it('Should split binary PDUs and invoke parser', (done) => {
            const pduWriter = new PduWriter(smppDefs);
            const pduBuffer = pduWriter.write(testPdus.bindTransceiver);
            const pduParserMock = {
                count: 0,
                parse(pdu) {
                    expect(pdu).to.be.instanceOf(Buffer);
                    expect(pdu).to.be.deep.equal(pduBuffer);
                    this.count++;
                    this.count === 3 && done();
                },
            };
            const stream = new PduParsingStream({}, pduParserMock);
            stream.write(Buffer.concat([pduBuffer, pduBuffer, pduBuffer]));
        });

        it('Should buffer and recombine stream chunks', (done) => {
            const pduWriter = new PduWriter(smppDefs);
            const pduParser = new PduParser(smppDefs);

            const pduBuffer = pduWriter.write(testPdus.bindTransceiver);
            const expectedPdu = pduParser.parse(pduBuffer);

            const stream = new PduParsingStream({}, pduParser);
            let count = 0;
            stream.on('data', (pdu) => {
                expect(pdu).to.be.deep.equal(expectedPdu);
                count++;
                count === 3 && done();
            });

            stream.write(pduBuffer.slice(0, 5));
            stream.write(pduBuffer.slice(5));
            stream.write(pduBuffer.slice(0, 17));
            setImmediate(() => {
                stream.write(Buffer.concat([pduBuffer.slice(17), pduBuffer.slice(0, 14)]));
                stream.write(pduBuffer.slice(14));
            });
        });

        it('Should not intercept exception thrown by onData listeners', (done) => {
            const pduWriter = new PduWriter(smppDefs);
            const pduBuffer = pduWriter.write(testPdus.bindTransceiver);
            const pduParserMock = {
                count: 0,
                parse() {
                    return {};
                },
            };
            const stream = new PduParsingStream({ parseSuppressError: true }, pduParserMock);

            // for sync or async error
            const origListeners = process.listeners('uncaughtException');
            process.removeAllListeners('uncaughtException');
            process.once('uncaughtException', (err) => {
                if (err.message === 'test') {
                    done();
                }
            });
            stream.on('data', () => {
                // restore listeners
                setImmediate(() => origListeners.forEach((listener) => process.on('uncaughtException', listener)));
                throw new Error('test');
            });
            try {
                stream.write(pduBuffer);
            } catch (err) {
                if (err.message === 'test') {
                    done();
                }
            }
        });
    });

    describe('Serializing stream', () => {
        it('Should accept PDU object and serialize to binary form', (done) => {
            const pduWriter = new PduWriter(smppDefs);
            const stream = new PduSerializingStream({}, pduWriter);
            stream.on('data', (chunk) => {
                expect(chunk).to.be.deep.equal(pduWriter.write(testPdus.bindTransceiver));
                done();
            });
            stream.write(testPdus.bindTransceiver);
        });
    });
});
