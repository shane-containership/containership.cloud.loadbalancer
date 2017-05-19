'use strict';

const _ = require('lodash');
const fs = require('fs');

module.exports = {

    defaults: {
        client_body_buffer_size: 128,
        client_max_body_size: 10,
        enable_http2: true,
        firewall_allowed_cidr: [],
        firewall_enabled: false,
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

        let has_basic_auth = false;
        let basic_auth_file = null;

        if (options.loadbalancer.basic_auth && _.keys(options.loadbalancer.basic_auth).length) {
            has_basic_auth = true;
            basic_auth_file = `/app/basic_auth/${options.application.id}`;

            if (fs.existsSync(basic_auth_file)) {
                fs.unlinkSync(basic_auth_file);
            }

            fs.writeFileSync(basic_auth_file, _.map(options.loadbalancer.basic_auth, (auth, name) => `${name}:${auth.password}`).join('\n'));
        }

        // build allowed cidr ranges into string
        options.firewall_allowed_cidr = _.map(options.firewall_allowed_cidr, (cidr) => {
            return `allow ${cidr};`;
        }).join('\n');

        return _.trim(`
server {
    listen ${options.loadbalancer.listen_port}${options.enable_http2 ? ' http2' : ''};
    server_name ${options.loadbalancer.domains.join(' ')};

    ${has_basic_auth ? 'auth_basic  "Basic Auth LB";' : ''}
    ${has_basic_auth ? `auth_basic_user_file ${basic_auth_file};` : ''}

    ssl on;
    ssl_ciphers '${options.ssl_ciphers}';
    ssl_protocols ${options.ssl_protocols};
    ssl_certificate ${options.ssl_cert_path};
    ssl_certificate_key ${options.ssl_key_path};

    location / {
        ${options.firewall_allowed_cidr}
        ${options.firewall_enabled ? 'deny all;' : ''}
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
