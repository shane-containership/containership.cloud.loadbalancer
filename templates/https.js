'use strict';

const _ = require('lodash');

module.exports = {

    defaults: {
        client_body_buffer_size: 128,
        client_max_body_size: 10,
        enable_http2: true,
        proxy_buffers_number: 32,
        proxy_buffers_size: 4,
        proxy_connect_timeout: 60,
        proxy_read_timeout: 60,
        proxy_send_timeout: 60,
        ssl_ciphers: 'kEECDH+ECDSA+AES128 kEECDH+ECDSA+AES256 kEECDH+AES128 kEECDH+AES256 kEDH+AES128 kEDH+AES256 DES-CBC3-SHA +SHA !aNULL !eNULL !LOW !MD5 !EXP !DSS !PSK !SRP !kECDH !CAMELLIA !RC4 !SEED',
        ssl_protocols: 'TLSv1 TLSv1.1 TLSv1.2'
    },

    render: function(options) {
        _.defaults(options, this.defaults);

        return _.trim(`
server {
    listen ${options.loadbalancer.listen_port}${options.enable_http2 ? ' http2' : ''};
    server_name ${options.loadbalancer.domains.join(' ')};

    ssl on;
    ssl_ciphers '${options.ssl_ciphers}';
    ssl_protocols ${options.ssl_protocols};
    ssl_certificate ${options.ssl_cert_path};
    ssl_certificate_key ${options.ssl_key_path};

    location / {
        proxy_set_header        Host                $host;
        proxy_set_header        X-Real-IP           $remote_addr;
        proxy_set_header        X-Forwarded-For     $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto   $scheme;
        proxy_http_version      1.1;
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
