'use strict';

const _ = require('lodash');

module.exports = {

    defaults: {
        err_log_level: 'warn',
        http_log_format: '$host $remote_addr [$time_local] "$request" $status $http_referer "$http_user_agent"',
        worker_connections: 512,
        worker_processes: 4
    },

    render: function(options) {
        _.defaults(options, this.defaults);

        return _.trim(`
daemon off;

worker_processes ${options.worker_processes};
events {
    worker_connections ${options.worker_connections};
}

error_log stderr ${options.err_log_level};

http {
    server_tokens off;
    log_format logformat '${options.http_log_format}';
    access_log /proc/1/fd/1 logformat;
    include /etc/nginx/http.d/*.conf;
}


stream {
    include /etc/nginx/tcp.d/*.conf;
}
        `);
    }

};
