'use strict';

const myriad = require('./lib/myriad');
const nginx = require('./lib/nginx');

const constants = require('@containership/containership.cloud.constants');
const semver = require('semver');

function start_nginx(callback) {
    nginx.write_config((err) => {
        if (err) {
            process.stderr.write(`${err.message}\n`);
        } else {
            nginx.start();
        }

        if(callback) {
            return callback();
        }
    });
}

start_nginx(() => {
    myriad.get_containership_version((err, version) => {
        // embedded myriad-kv version does not include 'subscribe' functionality
        // fall back to reloading on an interval
        if(err || semver.lt(version, '1.8.0')) {
            setInterval(start_nginx, process.env.NGINX_RELOAD_INTERVAL || 15000);
        } else {
            const loadbalancers_subscriber = myriad.subscribe(process.env.CONTAINERSHIP_LOADBALANCERS_REGEX || constants.myriad.LOADBALANCERS_REGEX);
            const firewalls_subscriber = myriad.subscribe(process.env.CONTAINERSHIP_FIREWALLS_REGEX || constants.myriad.FIREWALLS_REGEX);

            let coalescing = false;

            // subscribe to changes in containership applications and containers namespaces
            if(!loadbalancers_subscriber || !firewalls_subscriber) {
                process.stderr.write('Myriad .subscribe() method does not exist!\n');
                process.stderr.write('Are you running containership 1.8.0 or greater?\n');
                process.exit(1);
            }

            const propagate_updates = function(message){
                if(message.type === 'data') {
                    if(!coalescing) {
                        setTimeout(() => {
                            coalescing = false;
                            start_nginx();
                        }, process.env.MYRIAD_SUBSCRIBE_COALESCING_INTERVAL || 1000);

                        coalescing = true;
                    }
                }
            };

            loadbalancers_subscriber.on('message', propagate_updates);
            firewalls_subscriber.on('message', propagate_updates);
        }
    });
});
