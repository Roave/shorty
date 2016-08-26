'use strict';

const describe = require('mocha').describe;
const expect = require('chai').expect;
const it = require('mocha').it;
const smppDefs = require('../lib/smpp-definitions');
const smppUtils = require('../lib/utils');

describe('SMPP utils', () => {
    describe('isPduAllowedForSessionState', () => {
        it('Should return true for allowed state', () => {
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'bind_transceiver', smppDefs.sessionStates.OPEN)
            ).to.be.true;
        });

        it('Should return false for disallowed state', () => {
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'bind_transceiver', smppDefs.sessionStates.BOUND_TRX)
            ).to.be.false;
        });
        it('Should return false for server side when allowed only for client side', () => {
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'bind_transceiver', smppDefs.sessionStates.OPEN, false)
            ).to.be.true;
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'bind_transceiver', smppDefs.sessionStates.OPEN, true)
            ).to.be.false;
        });
        it('Should return false for client side when allowed only for server state', () => {
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'outbind', smppDefs.sessionStates.OPEN, true)
            ).to.be.true;
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'outbind', smppDefs.sessionStates.OPEN, false)
            ).to.be.false;
        });

        it('Should return true when allowed for server and client side', () => {
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'enquire_link', smppDefs.sessionStates.OPEN, true)
            ).to.be.true;
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'enquire_link', smppDefs.sessionStates.OPEN, false)
            ).to.be.true;
        });
        // note that while it is allowed by helper, response must have matching command or it will be ignored by session
        it('Response is always allowed', () => {
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'submit_sm_resp', smppDefs.sessionStates.OPEN, true)
            ).to.be.true;
            expect(
                smppUtils.isPduAllowedForSessionState(smppDefs, 'submit_sm_resp', smppDefs.sessionStates.OPEN, false)
            ).to.be.true;
        });
    });

    describe('isResponsePdu', () => {
        it('Should return true for response', () => {
            expect(smppUtils.isResponsePdu(smppDefs, 'submit_sm_resp')).to.be.true;
        });
        it('Should return false for command', () => {
            expect(smppUtils.isResponsePdu(smppDefs, 'submit_sm')).to.be.false;
        });
        it('Should throw error for undefined command', () => {
            expect(() => smppUtils.isResponsePdu(smppDefs, 'undefined_command'))
                .to.throw('Command undefined_command is not defined');
        });
    });

    describe('errorResponse', () => {
        it('Should return appropriate response pdu', () => {
            const pdu = smppUtils.errorResponse(smppDefs, { command: 'submit_sm' }, 'ESME_RUNKNOWNERR');
            expect(pdu.command).to.be.equal('submit_sm_resp');
        });
        it('Should return generic_nack for command with no response', () => {
            const pdu = smppUtils.errorResponse(smppDefs, { command: 'alert_notification' }, 'ESME_RUNKNOWNERR');
            expect(pdu.command).to.be.equal('generic_nack');
        });
        it('Should return generic_nack for undefined command', () => {
            const pdu = smppUtils.errorResponse(smppDefs, { command: 'undefined_command' }, 'ESME_RUNKNOWNERR');
            expect(pdu.command).to.be.equal('generic_nack');
        });
        it('Should set command status', () => {
            const pdu = smppUtils.errorResponse(smppDefs, { command: 'submit_sm' }, 'ESME_RSYSERR');
            expect(pdu.command_status).to.be.equal('ESME_RSYSERR');
        });
    });
});

