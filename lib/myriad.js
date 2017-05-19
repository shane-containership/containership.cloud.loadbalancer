'use strict';

const _ = require('lodash');
const async = require('async');
const constants = require('@containership/containership.cloud.constants');
const MyriadKVClient = require('myriad-kv-client');
const os = require('os');

const interfaces = os.networkInterfaces();

let myriad_host = '127.0.0.1';
let cs_opts;

try {
    cs_opts = JSON.parse(process.env.CS_PROC_OPTS);
}
catch(err) {
    cs_opts = {};
}

if(cs_opts.legiond && cs_opts.legiond.network && cs_opts.legiond.network.interface) {
    const iface = _.find(interfaces[cs_opts.legiond.network.interface], (iface) => {
        return iface.family === 'IPv4';
    });

    if(iface && iface.address) {
        myriad_host = iface.address;
    }
}

const myriad_kv_client = new MyriadKVClient({
    host: myriad_host,
    port: process.env.MYRIAD_PORT || 2666
});

const myriad = {

    get_applications(callback) {
        myriad_kv_client.keys('containership::application::*', (err, keys) => {
            if(err) {
                return callback(new Error('Cannot get applications from myriad-kv'));
            }

            async.map(keys || [], (key, callback) => {
                myriad_kv_client.get(key, (err, application) => {
                    if(err) {
                        process.stderr.write(`Error getting key ${application} from myriad-kv\n`);
                        return callback();
                    }

                    try {
                        application = JSON.parse(application);
                        return callback(null, application);
                    } catch(err) {
                        process.stderr.write('Error parsing application returned from myriad-kv\n');
                        return callback();
                    }
                });
            }, callback);
        });
    },

    get_containership_version(callback) {
        myriad_kv_client.stat((err, stats) => {
            if(err) {
                return callback(new Error('Cannot get containership version from myriad-kv'));
            }

            const attributes = _.find(stats.hosts, (host) => {
                return host.host_name === os.hostname();
            });

            if(attributes && attributes.metadata && attributes.metadata.containership && attributes.metadata.containership.version) {
                return callback(null, attributes.metadata.containership.version);
            } else {
                return callback(new Error('Cannot get containership version from myriad-kv'));
            }
        });
    },

    get_firewalls(callback) {
        myriad_kv_client.get(constants.myriad.FIREWALLS, (err, firewalls) => {
            if(err) {
                return callback(new Error('Cannot get firewalls from myriad-kv'));
            }

            try {
                firewalls = JSON.parse(firewalls);
                return callback(null, firewalls);
            } catch(err) {
                process.stderr.write('Error parsing firewalls returned from myriad-kv\n');
                return callback(err);
            }
        });
    },

    get_loadbalancers(callback) {
        myriad_kv_client.get(constants.myriad.LOADBALANCERS, (err, loadbalancers) => {
            if(err) {
                return callback(new Error('Cannot get loadbalancers from myriad-kv'));
            }

            try {
                loadbalancers = JSON.parse(loadbalancers);
                return callback(null, loadbalancers);
            } catch(err) {
                process.stderr.write('Error parsing loadbalancers returned from myriad-kv\n');
                return callback(err);
            }
        });
    },

    subscribe(pattern) {
        if(myriad_kv_client.subscribe) {
            return myriad_kv_client.subscribe(pattern);
        }
    }

};

module.exports = myriad;
