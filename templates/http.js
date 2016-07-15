'use strict';

const _ = require('lodash');

module.exports = {

    defaults: {
        client_body_buffer_size: 128,
        client_max_body_size: 10,
        proxy_buffers_number: 32,
        proxy_buffers_size: 4,
        proxy_connect_timeout: 60,
        proxy_read_timeout: 60,
        proxy_send_timeout: 60
    },

    render: function(options) {
        _.defaults(options, this.defaults);

        return _.trim(`
server {
    listen ${options.loadbalancer.listen_port};
    server_name ${options.loadbalancer.domains.join(' ')};
    ${options.loadbalancer.force_https ? 'return 301 https://$host:$server_port$request_uri;' : ''}

    location / {
        proxy_set_header        Host                $host;
        proxy_set_header        X-Real-IP           $remote_addr;
        proxy_set_header        X-Forwarded-For     $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto   $scheme;
        client_max_body_size    ${options.client_max_body_size}m;
        client_body_buffer_size ${options.client_body_buffer_size}k;
        proxy_connect_timeout   ${options.proxy_connect_timeout}s;
        proxy_read_timeout      ${options.proxy_read_timeout}s;
        proxy_send_timeout      ${options.proxy_send_timeout}s;
        proxy_buffers           ${options.proxy_buffers_number} ${options.proxy_buffers_size}k;
        proxy_pass http://127.0.0.1:${options.application.discovery_port};
    }
}
        `);
    }

};
