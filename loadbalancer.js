var os = require("os");
var fs = require("fs");
var child_process = require("child_process");
var _ = require("lodash");
var async = require("async");
var request = require("request");
var crypto = require("crypto");
var MyriadKVClient = require("myriad-kv-client");
var template = require([__dirname, "lib", "template"].join("/"));

var config = {};

try{
    var cs_opts = JSON.parse(process.env.CS_PROC_OPTS);
}
catch(err){
    var cs_opts = {};
}

var interfaces = os.networkInterfaces();
var myriad_host;

if(_.has(cs_opts, "legiond") && _.has(cs_opts.legiond, "network") && _.has(cs_opts.legiond.network, "interface")){
    var iface = _.find(interfaces[cs_opts.legiond.network.interface], function(iface){
        return iface.family == "IPv4";
    });

    if(!_.isUndefined(iface) && _.has(iface, "address"))
        myriad_host = iface.address;
}

config.myriad = _.defaults({
    host: myriad_host,
    port: process.env.MYRIAD_PORT
}, {
    host: "127.0.0.1",
    port: 2666
});

config.haproxy = _.defaults({
    max_connections: process.env.HAPROXY_GLOBAL_MAX_CONN,
    connect_timeout: process.env.HAPROXY_DEFAULT_CONNECT_TIMEOUT,
    client_timeout: process.env.HAPROXY_DEFAULT_CLIENT_TIMEOUT,
    server_timeout: process.env.HAPROXY_DEFAULT_SERVER_TIMEOUT,
    write_interval: process.env.HAPROXY_WRITE_INTERVAL
}, {
    max_connections: 16384,
    connect_timeout: 30000,
    client_timeout: 30000,
    server_timeout: 30000,
    write_interval: 15000
});

if(process.env.HAPROXY_DEFAULT_OPTIONS)
    config.haproxy.default_options = process.env.HAPROXY_DEFAULT_OPTIONS.replace(/ /g, "").split(",");
else{
    config.haproxy.default_options = [
        "dontlognull",
        "forwardfor"
    ]
}

config.containership = _.defaults({
    api_key: process.env.CONTAINERSHIP_CLOUD_API_KEY,
    api_version: process.env.CONTAINERSHIP_CLOUD_API_VERSION,
    organization: process.env.CONTAINERSHIP_CLOUD_ORGANIZATION
}, {
    api_version: "v1"
});

var myriad_kv_client = new MyriadKVClient({
    host: config.myriad.host,
    port: config.myriad.port
});

var haproxy = {

    config_file: "haproxy.conf",

    checksum: null,

    write_config: function(fn){
        var self = this;

        this.get_content(function(err, content){
            if(err)
                return fn(err);

            var checksum = crypto.createHash("md5").update(content).digest("hex");

            if(checksum != self.checksum){
                fs.writeFile(haproxy.config_file, content, function(err){
                    if(err)
                        return fn(err);

                    self.checksum = checksum;

                    if(_.isUndefined(self.process))
                        self.start();
                    else
                        self.reload();

                    return fn();
                });
            }
        });
    },

    get_content: function(fn){
        var content = [
            template.global(config.haproxy),
            template.defaults(config.haproxy)
        ]

        if(process.env.METRICS_ENABLED)
            content.push(template.stats);

        async.parallel({
            applications: myriad.get_applications,
            loadbalancers: containership.get_loadbalancers
        }, function(err, response){
            if(err)
                return fn(err);

            var loadbalancers_by_type = _.groupBy(response.loadbalancers, "type");

            if(_.has(loadbalancers_by_type, "tcp")){
                var cluster_loadbalancers = _.filter(loadbalancers_by_type.tcp, function(loadbalancer){
                    return loadbalancer.cluster_id == process.env.CS_CLUSTER_ID;
                });

                _.each(cluster_loadbalancers, function(loadbalancer){
                    if(_.has(response.applications, loadbalancer.application)){
                        var listen_line = template.tcp_listen({
                            id: loadbalancer.application,
                            port: loadbalancer.listen_port,
                            discovery_port: response.applications[loadbalancer.application].discovery_port
                        });

                        content.push(listen_line);
                    }
                });
            }

            if(_.has(loadbalancers_by_type, "http")){
                var cluster_loadbalancers = _.filter(loadbalancers_by_type.http, function(loadbalancer){
                    return loadbalancer.cluster_id == process.env.CS_CLUSTER_ID;
                });

                var http_by_port = _.groupBy(cluster_loadbalancers, "listen_port");

                _.each(http_by_port, function(loadbalancers, listen_port){
                    var http_frontend = template.http_frontend({
                        port: listen_port,
                        loadbalancers: loadbalancers
                    });

                    content.push(http_frontend);
                });
            }

            _.each(response.applications, function(application, application_name){
                var backend = template.backend({
                    id: application_name,
                    port: application.discovery_port
                });

                content.push(backend);
            });

            return fn(null, _.flatten(content).join("\n"));
        });
    },

    start: function(){
        this.process = child_process.spawn("haproxy", ["-f", "haproxy.conf", "-p", "/var/run/haproxy.pid"])
    },

    reload: function(){
        var pid = this.process.pid;
        this.process = child_process.spawn("haproxy", ["-f", "haproxy.conf", "-p", "/var/run/haproxy.pid", "-sf", pid])
    }

}

var myriad = {

    get_applications: function(fn){
        myriad_kv_client.keys(["containership", "application", "*"].join("::"), function(err, keys){
            if(err)
                return fn(err);

            var applications = {};

            async.each(keys, function(key, fn){
                myriad_kv_client.get(key, function(err, application){
                    if(err)
                        return fn(err);

                    try{
                        application = JSON.parse(application);
                        applications[application.id] = application;
                        return fn();
                    }
                    catch(err){
                        return fn(err);
                    }
                });
            }, function(err){
                if(err)
                    return fn(err);

                return fn(null, applications);
            });
        });
    }

}

var containership = {

    get_loadbalancers: function(fn){
        var options = {
            url: ["https://api.containership.io", config.containership.api_version, config.containership.organization, "loadbalancers"].join("/"),
            method: "GET",
            json: true,
            headers: {
                "X-ContainerShip-Cloud-Organization": config.containership.organization,
                "X-ContainerShip-Cloud-API-Key": config.containership.api_key
            },
            timeout: 5000
        }

        request(options, function(err, response){
            if(err)
                return fn(err);
            else
                return fn(null, response.body);
        });
    },

}

haproxy.write_config(function(err){
    if(err)
        process.stderr.write(err.message);

    setInterval(function(){
        haproxy.write_config(function(err){
            if(err)
                process.stderr.write(err.message);
        });
    }, config.haproxy.write_interval);
});
