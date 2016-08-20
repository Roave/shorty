'use strict';

const expect = require('chai').expect;
const describe = require('mocha').describe;
const it = require('mocha').it;
const PassThroughStream = require('stream').PassThrough;
const Session = require('../lib/session').Session;
const smppDefs = require('../lib/smpp-definitions');
const Protocol = require('../lib/protocol');
const PduWriter = require('../lib/pdu-writer');
const PduParser = require('../lib/pdu-parser');
const testPdus = require('./_assets/pdu');

class MockProtocol extends Protocol {
    constructor() {
        const writer = new PduWriter(smppDefs);
        const parser = new PduParser(smppDefs);
        const mockSocket = new PassThroughStream;
        mockSocket.destroy = () => {
            mockSocket.end();
            mockSocket.emit('close');
        };
        mockSocket.destroy = () => {
            mockSocket.end();
            mockSocket.emit('close');
        };
        super(mockSocket, parser, writer);
        this.mockSocket = mockSocket;
        this.sentPdu = [];
    }

    sendPdu(pdu) {
        // trigger error for bad pdu
        this._writer.write(pdu);
        this.sentPdu.push(pdu);
        return true;
    }

    mockedReceivePdu(pdu) {
        this.mockSocket.write(this._writer.write(pdu));
    }
}

describe('SMPP session', () => {
    it('New session have no state', () => {
        const protocol = new MockProtocol();
        const session = new Session(protocol, smppDefs);
        expect(session.state).to.be.null;
        session.destroy();
    });

    it('Should enter state OPEN on start', () => {
        const protocol = new MockProtocol();
        const session = new Session(protocol, smppDefs);
        session.start();
        expect(session.state).to.be.equal(smppDefs.sessionStates.OPEN);
        session.destroy();
    });

    it('Should error on attempt to start session again', () => {
        const protocol = new MockProtocol();
        const session = new Session(protocol, smppDefs);
        session.start();
        expect(() => session.start()).to.throw('Session can only start once');
        session.destroy();
    });

    it('Should return Promise when sending PDU', () => {
        const protocol = new MockProtocol();
        const session = new Session(protocol, smppDefs);
        session.start();

        const testPdu = testPdus.enquireLink;

        expect(session.sendPdu(testPdu)).to.be.instanceOf(Promise);
        session.destroy();
    });

    it('Should send PDU object to protocol', (done) => {
        const protocol = new MockProtocol();
        const session = new Session(protocol, smppDefs);
        session.start();

        const testPdu = testPdus.enquireLink;

        protocol.sendPdu = (pdu) => {
            expect(pdu.command).to.be.equal(testPdu.command);
            done();
            session.destroy();
            return true;
        };
        session.sendPdu(testPdu);
    });

    it('Should assign incrementing sequence numbers to sent PDUs', (done) => {
        const protocol = new MockProtocol();
        const session = new Session(protocol, smppDefs);
        session.start();

        const testPdu = testPdus.enquireLink;

        let count = 1;

        protocol.sendPdu = (pdu) => {
            expect(pdu.sequence_number).to.be.equal(count);
            count++;
            if (count === 2) {
                session.destroy();
                done();
            }
            return true;
        };
        session.sendPdu(testPdu);
        session.sendPdu(testPdu);
    });

    it('Should not increment sequence number when sending responses', (done) => {
        const protocol = new MockProtocol();
        const session = new Session(protocol, smppDefs);
        session.start();

        const testPdu = testPdus.enquireLinkResp;
        const initialSeq = session._context.sequenceNumber;

        let count = 1;
        protocol.sendPdu = () => {
            expect(session._context.sequenceNumber).to.be.equal(initialSeq);
            count++;
            if (count === 2) {
                session.destroy();
                done();
            }
            return true;
        };
        session.sendPdu(testPdu);
        session.sendPdu(testPdu);
    });

    it('Should enter BOUND_RX state on succesful receiver bind', (done) => {
        const protocol = new MockProtocol();
        protocol.on('parseError', (err) => done(err));
        const session = new Session(protocol, smppDefs);
        session.start();

        const bindPdu = testPdus.bindReceiver;

        protocol.sendPdu = (pdu) => {
            expect(pdu.command).to.be.equal('bind_receiver');
            protocol.mockedReceivePdu({
                command: 'bind_receiver_resp',
                command_status: 'ESME_ROK',
                sequence_number: pdu.sequence_number,
                fields: {
                    system_id: 'test',
                },
                optional_params: {},
            });

            return true;
        };
        session.sendPdu(bindPdu).catch((err) => done(err));
        session.on('bindFailure', (err) => done(err));
        session.on('state BOUND_RX', () => {
            done();
            session.destroy();
        });
    });
    it('Should enter BOUND_TX state on succesful transmitter bind', (done) => {
        const protocol = new MockProtocol();
        protocol.on('parseError', (err) => done(err));
        const session = new Session(protocol, smppDefs);
        session.start();

        const bindPdu = testPdus.bindTransmitter;

        protocol.sendPdu = (pdu) => {
            expect(pdu.command).to.be.equal('bind_transmitter');
            protocol.mockedReceivePdu({
                command: 'bind_transmitter_resp',
                command_status: 'ESME_ROK',
                sequence_number: pdu.sequence_number,
                fields: {
                    system_id: 'test',
                },
                optional_params: {},
            });

            return true;
        };
        session.sendPdu(bindPdu).catch((err) => done(err));
        session.on('bindFailure', (err) => done(err));
        session.on('state BOUND_TX', () => {
            done();
            session.destroy();
        });
    });

    it('Should enter BOUND_TRX state on succesful transceiver bind', (done) => {
        const protocol = new MockProtocol();
        protocol.on('parseError', (err) => done(err));
        const session = new Session(protocol, smppDefs);
        session.start();

        const bindPdu = testPdus.bindTransceiver;

        protocol.sendPdu = (pdu) => {
            expect(pdu.command).to.be.equal('bind_transceiver');
            protocol.mockedReceivePdu({
                command: 'bind_transceiver_resp',
                command_status: 'ESME_ROK',
                sequence_number: pdu.sequence_number,
                fields: {
                    system_id: 'test',
                },
                optional_params: {},
            });

            return true;
        };
        session.sendPdu(bindPdu).catch((err) => done(err));
        session.on('bindFailure', (err) => done(err));
        session.on('state BOUND_TRX', () => {
            done();
            session.destroy();
        });
    });
});
