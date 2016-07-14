'use strict';

const myriad = require('./myriad');
const templates = require('../templates');

const fs = require('fs');
const _ = require('lodash');
const async = require('async');
const child_process = require('child_process');

const CONFIG_FILE = '/etc/nginx/nginx.conf';
const HTTP_DIR = '/etc/nginx/http.d';
const TCP_DIR = '/etc/nginx/tcp.d';

module.exports = {

    write_config: function(write_config_callback) {
        function write_core(callback) {
            fs.stat(CONFIG_FILE, (err/*, stats*/) => {
                if (err) {
                    fs.writeFile(CONFIG_FILE, templates.core.render({
                        err_log_level: process.env.NGINX_ERR_LOG_LEVEL,
                        http_log_format: process.env.NGINX_HTTP_LOG_FORMAT,
                        worker_connections: process.env.NGINX_WORKER_CONNECTIONS,
                        worker_processes: process.env.NGINX_WORKER_PROCESSES
                    }), callback);
                } else {
                    return callback();
                }
            });
        }

        function remove_config_directories(remove_config_directories_callback) {
            function remove_directory(directory, remove_directory_callback) {
                fs.readdir(directory, (err, files) => {
                    if (err) {
                        process.stderr.write(`Error fetching configurations from ${directory}!\n`);
                        return remove_directory_callback();
                    }

                    async.each(files || [], (file, callback) => {
                        fs.unlink(`${directory}/${file}`, (err) => {
                            if (err) {
                                process.stderr.write(`${err.message}\n`);
                            }

                            return callback();
                        });
                    }, remove_directory_callback);
                });
            }

            async.parallel([
                (callback) => {
                    remove_directory(HTTP_DIR, callback);
                },

                (callback) => {
                    remove_directory(TCP_DIR, callback);
                }
            ], remove_config_directories_callback);
        }

        function write_vhosts(write_vhosts_callback) {
            async.parallel({
                applications: myriad.get_applications,
                loadbalancers: myriad.get_loadbalancers
            }, (err, response) => {
                if (err) {
                    return write_vhosts_callback(err);
                }

                response.applications = _.indexBy(response.applications, 'id');

                function write_tcp_vhosts(tcp_lbs, write_tcp_vhosts_callback) {
                    async.each(tcp_lbs, (lb, callback) => {
                        if (response.applications[lb.application]) {
                            fs.writeFile(`${TCP_DIR}/${lb.application}_${lb.listen_port}.conf`, templates.tcp.render({
                                application: response.applications[lb.application],
                                loadbalancer: lb,
                                proxy_write_timeout: process.env.NGINX_PROXY_WRITE_TIMEOUT,
                                proxy_timeout: process.env.NGINX_PROXY_TIMEOUT
                            }), (err) => {
                                if (err) {
                                    process.stderr.write(`TCP vhost ${lb.application}: ${err.message}\n`);
                                }

                                return callback();
                            });
                        }
                    }, write_tcp_vhosts_callback);
                }

                function write_http_vhosts(http_lbs, write_http_vhosts_callback) {
                    async.each(http_lbs, (lb, callback) => {
                        if (response.applications[lb.application]) {
                            fs.writeFile(`${HTTP_DIR}/${lb.application}_${lb.listen_port}.conf`, templates.http.render({
                                application: response.applications[lb.application],
                                loadbalancer: lb,
                                client_body_buffer_size: process.env.NGINX_CLIENT_BODY_BUFFER_SIZE,
                                client_max_body_size: process.env.NGINX_CLIENT_MAX_BODY_SIZE,
                                proxy_buffers_number: process.env.PROXY_BUFFERS_NUMBER,
                                proxy_buffers_size: process.env.PROXY_BUFFERS_SIZE,
                                proxy_connect_timeout: process.env.PROXY_CONNECT_TIMEOUT,
                                proxy_read_timeout:process.env.PROXY_READ_TIMEOUT,
                                proxy_send_timeout:process.env.PROXY_SEND_TIMEOUT
                            }), (err) => {
                                if (err) {
                                    process.stderr.write(`HTTP vhost ${lb.application}: ${err.message}\n`);
                                }

                                return callback();
                            });
                        }
                    }, write_http_vhosts_callback);
                }

                const lbs_by_type = _.groupBy(response.loadbalancers, 'type');

                async.parallel([
                    (callback) => {
                        write_tcp_vhosts(lbs_by_type.tcp || [], callback);
                    },

                    (callback) => {
                        write_http_vhosts(lbs_by_type.http || [], callback);
                    }
                ], write_vhosts_callback);
            });
        }

        async.series([
            write_core,
            remove_config_directories,
            write_vhosts
        ], write_config_callback);
    },

    start: function() {
        if (this.process) {
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
