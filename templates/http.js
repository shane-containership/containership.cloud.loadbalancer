'use strict';

const _ = require('lodash');
const fs = require('fs');

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

        let basic_auth = false;
        let basic_auth_file = null;

        if (options.loadbalancer.basic_auth_list && options.loadbalancer.basic_auth_list.length) {
            basic_auth = true;
            basic_auth_file = `/app/basic_auth/${options.application.id}`;

            if (fs.existsSync(basic_auth_file)) {
                fs.unlinkSync(basic_auth_file);
            }

            fs.writeFileSync(basic_auth_file, _.map(options.loadbalancer.basic_auth_list, auth => `${auth}\n`));
        }

        return _.trim(`
server {
    listen ${options.loadbalancer.listen_port};
    server_name ${options.loadbalancer.domains.join(' ')};

    if ($http_x_forwarded_proto != "https") {
        ${options.loadbalancer.force_https ? 'return 301 https://$host$request_uri;' : ''}
    }

    ${basic_auth ? 'auth_basic  "Basic Auth LB";' : ''}
    ${basic_auth ? `auth_basic_user_file ${basic_auth_file};` : ''}

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
