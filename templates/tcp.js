'use strict';

const _ = require('lodash');

module.exports = {

    defaults: {
        proxy_connect_timeout: 60,
        proxy_timeout: 60
    },

    render: function(options) {
        _.defaults(options, this.defaults);

        return _.trim(`
server {
    listen ${options.loadbalancer.listen_port};
    proxy_connect_timeout ${options.proxy_connect_timeout}s;
    proxy_timeout ${options.proxy_timeout}s;
    proxy_pass 127.0.0.1:${options.application.discovery_port};
}
        `);
    }

};
