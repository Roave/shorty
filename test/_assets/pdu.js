'use strict';

// Using getters to avoid accidental test assets modification
module.exports = class {
    static get bindReceiver() {
        return {
            command: 'bind_receiver',
            command_status: "ESME_ROK",
            fields: {
                system_id: 'unit_testing',
                password: 'pass',
                system_type: 'shorty_testing',
                interface_version: 0x34,
                addr_ton: 0,
                addr_npi: 1,
                address_range: "",
            },
            optional_params: {},
        };
    }

    static get bindTransceiver() {
        return {
            command: 'bind_transceiver',
            command_status: "ESME_ROK",
            fields: {
                system_id: 'unit_testing',
                password: 'pass',
                system_type: 'shorty_testing',
                interface_version: 0x34,
                addr_ton: 0,
                addr_npi: 1,
                address_range: "",
            },
            optional_params: {},
        };
    }

    static get bindTransmitter() {
        return {
            command: 'bind_transmitter',
            command_status: "ESME_ROK",
            fields: {
                system_id: 'unit_testing',
                password: 'pass',
                system_type: 'shorty_testing',
                interface_version: 0x34,
                addr_ton: 0,
                addr_npi: 1,
                address_range: "",
            },
            optional_params: {},
        };
    }

    static get enquireLink() {
        return {
            command: "enquire_link",
            command_status: "ESME_ROK",
            fields: {},
            optional_params: {},
        };

    }

    static get enquireLinkResp() {
        return {
            command: "enquire_link_resp",
            command_status: "ESME_ROK",
            fields: {},
            optional_params: {},
        };
    }
};

