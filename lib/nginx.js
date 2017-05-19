'use strict';

const myriad = require('./myriad');
const templates = require('../templates');

const fs = require('fs');
const _ = require('lodash');
const async = require('async');
const child_process = require('child_process');
const path = require('path');

const CONFIG_FILE = path.resolve('/etc/nginx/nginx.conf');
const SSL_DIR = path.resolve('/etc/nginx/ssl');
const HTTPS_DIR = path.resolve('/etc/nginx/https.d');
const HTTP_DIR = path.resolve('/etc/nginx/http.d');
const TCP_DIR = path.resolve('/etc/nginx/tcp.d');

module.exports = {

    write_config(callback) {
        // write core configuration file
        function write_core(callback) {
            fs.stat(CONFIG_FILE, (err) => {
                if(err) {
                    fs.writeFile(CONFIG_FILE, templates.core.render({
                        err_log_level: process.env.NGINX_ERR_LOG_LEVEL,
                        http_log_format: process.env.NGINX_HTTP_LOG_FORMAT,
                        server_names_hash_bucket_size: process.env.NGINX_SERVER_NAMES_HASH_BUCKET_SIZE,
                        worker_connections: process.env.NGINX_WORKER_CONNECTIONS,
                        worker_processes: process.env.NGINX_WORKER_PROCESSES
                    }), callback);
                } else {
                    return callback();
                }
            });
        }

        // remove all configuration directories
        function remove_config_directories(callback) {

            // remove specific configuration directory
            function remove_directory(directory, callback) {
                fs.readdir(directory, (err, files) => {
                    if(err) {
                        process.stderr.write(`Error fetching configurations from ${directory}!\n`);
                        return callback();
                    }

                    async.each(files || [], (file, callback) => {
                        fs.unlink(`${directory}/${file}`, (err) => {
                            if(err) {
                                process.stderr.write(`${err.message}\n`);
                            }

                            return callback();
                        });
                    }, callback);
                });
            }

            // removes directories in parallel
            async.parallel([
                (callback) => {
                    remove_directory(SSL_DIR, callback);
                },

                (callback) => {
                    remove_directory(HTTPS_DIR, callback);
                },

                (callback) => {
                    remove_directory(HTTP_DIR, callback);
                },

                (callback) => {
                    remove_directory(TCP_DIR, callback);
                }
            ], callback);
        }

        // write all vhosts
        function write_vhosts(callback) {
            async.parallel({
                applications: myriad.get_applications,
                firewalls: (callback) => {
                    myriad.get_firewalls((err, firewalls) => {
                        if(err) {
                            return callback();
                        } else {
                            return callback(null, firewalls);
                        }
                    });
                },
                loadbalancers: myriad.get_loadbalancers
            }, (err, response) => {
                if(err) {
                    return callback(err);
                }

                const firewall_enabled = response.firewalls !== undefined;

                if(firewall_enabled) {
                    response.firewalls = _.filter(response.firewalls, (firewall) => {
                        return firewall.type === 'loadbalancer';
                    });
                }

                response.firewalls = _.groupBy(response.firewalls, 'loadbalancer');
                response.applications = _.indexBy(response.applications, 'id');

                function write_tcp_vhosts(tcp_lbs, callback) {
                    async.each(tcp_lbs, (lb, callback) => {
                        if(!response.applications[lb.application]) {
                            return callback();
                        }

                        fs.writeFile(`${TCP_DIR}/${lb.application}_${lb.listen_port}.conf`, templates.tcp.render({
                            application: response.applications[lb.application],
                            loadbalancer: lb,
                            proxy_write_timeout: process.env.NGINX_PROXY_WRITE_TIMEOUT,
                            proxy_timeout: process.env.NGINX_PROXY_TIMEOUT
                        }), (err) => {
                            if(err) {
                                process.stderr.write(`TCP vhost ${lb.application}: ${err.message}\n`);
                            }

                            return callback();
                        });

                    }, callback);
                }

                function write_http_vhosts(http_lbs, callback) {
                    async.each(http_lbs, (lb, callback) => {
                        if(!response.applications[lb.application]) {
                            return callback();
                        }

                        fs.writeFile(`${HTTP_DIR}/${lb.application}_${lb.listen_port}.conf`, templates.http.render({
                            application: response.applications[lb.application],
                            loadbalancer: lb,
                            client_body_buffer_size: process.env.NGINX_CLIENT_BODY_BUFFER_SIZE,
                            client_max_body_size: process.env.NGINX_CLIENT_MAX_BODY_SIZE,
                            firewall_allowed_cidr: _.map(response.firewalls[lb.id], 'source'),
                            firewall_enabled: firewall_enabled,
                            proxy_buffers_number: process.env.NGINX_PROXY_BUFFERS_NUMBER,
                            proxy_buffers_size: process.env.NGINX_PROXY_BUFFERS_SIZE,
                            proxy_connect_timeout: process.env.NGINX_PROXY_CONNECT_TIMEOUT,
                            proxy_read_timeout: process.env.NGINX_PROXY_READ_TIMEOUT,
                            proxy_send_timeout: process.env.NGINX_PROXY_SEND_TIMEOUT
                        }), (err) => {
                            if(err) {
                                process.stderr.write(`HTTP vhost ${lb.application}: ${err.message}\n`);
                            }

                            return callback();
                        });

                    }, callback);
                }

                function write_https_vhosts(https_lbs, callback) {
                    async.each(https_lbs, (lb, callback) => {
                        if(!response.applications[lb.application]) {
                            return callback();
                        }

                        const ssl_cert_path = `${SSL_DIR}/${lb.id}.crt`;
                        const ssl_key_path = `${SSL_DIR}/${lb.id}.key`;

                        async.parallel([
                            function(write_ssl_err) {
                                fs.writeFile(ssl_cert_path, lb.ssl.cert, write_ssl_err);
                            },

                            function(write_ssl_err) {
                                fs.writeFile(ssl_key_path, lb.ssl.key, write_ssl_err);
                            }
                        ], (write_certs_err) => {
                            if(write_certs_err) {
                                process.stderr.write(`HTTPS vhost ${lb.application}: ${write_certs_err.message}\n`);
                                return callback();
                            }

                            fs.writeFile(`${HTTPS_DIR}/${lb.application}_${lb.listen_port}.conf`, templates.https.render({
                                application: response.applications[lb.application],
                                loadbalancer: lb,
                                client_body_buffer_size: process.env.NGINX_CLIENT_BODY_BUFFER_SIZE,
                                client_max_body_size: process.env.NGINX_CLIENT_MAX_BODY_SIZE,
                                enable_http2: process.env.NGINX_ENABLE_HTTP2,
                                firewall_allowed_cidr: _.map(response.firewalls[lb.id], 'source'),
                                firewall_enabled: firewall_enabled,
                                proxy_buffers_number: process.env.NGINX_PROXY_BUFFERS_NUMBER,
                                proxy_buffers_size: process.env.NGINX_PROXY_BUFFERS_SIZE,
                                proxy_connect_timeout: process.env.NGINX_PROXY_CONNECT_TIMEOUT,
                                proxy_read_timeout: process.env.NGINX_PROXY_READ_TIMEOUT,
                                proxy_send_timeout: process.env.NGINX_PROXY_SEND_TIMEOUT,
                                ssl_cert_path: ssl_cert_path,
                                ssl_ciphers: process.env.NGINX_SSL_CIPHERS,
                                ssl_key_path: ssl_key_path,
                                ssl_protocols: process.env.NGINX_SSL_PROTOCOLS
                            }), (err) => {
                                if(err) {
                                    process.stderr.write(`HTTPS vhost ${lb.application}: ${err.message}\n`);
                                }

                                return callback();
                            });
                        });

                    }, callback);
                }

                const lbs_by_type = _.groupBy(response.loadbalancers, 'type');

                // write vhosts in parallel
                async.parallel([
                    (callback) => {
                        write_tcp_vhosts(lbs_by_type.tcp || [], callback);
                    },

                    (callback) => {
                        write_http_vhosts(lbs_by_type.http || [], callback);
                    },

                    (callback) => {
                        write_https_vhosts(lbs_by_type.https || [], callback);
                    }
                ], callback);
            });
        }

        async.series([
            write_core,
            remove_config_directories,
            write_vhosts
        ], callback);
    },

    start() {
        if(this.process) {
            process.stdout.write('Reloading nginx process ...\n');
            process.kill(this.process.pid, 'SIGHUP');
        } else {
            process.stdout.write('Starting nginx process ...\n');
            this.process = child_process.spawn('nginx', ['-c', 'nginx.conf']);

            this.process.stdout.on('data', (data) => {
                process.stdout.write(data);
            });

            this.process.stderr.on('data', (data) => {
                process.stderr.write(data);
            });
        }
    }

};
