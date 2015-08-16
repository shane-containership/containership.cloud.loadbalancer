var fs = require("fs");
var child_process = require("child_process");
var _ = require("lodash");
var async = require("async");
var request = require("request");
var dns = require("native-dns");

var haproxy = {

    config_location: "haproxy.conf",

    write_config: function(){
        var self = this;

        var content = [
            "global",
                "\tmaxconn 4096",
            "defaults",
                "\tlog global",
                "\tmode tcp",
                "\toption dontlognull",
                "\tretries 3",
                "\ttimeout connect 30000",
                "\ttimeout client 30000",
                "\ttimeout server 30000"
        ]

        async.parallel({
            applications: containership.get_applications,
            loadbalancers: containership.get_loadbalancers
        }, function(err, response){
            if(!_.isUndefined(response.loadbalancers) && !_.isUndefined(response.applications)){
                var lbs_by_type = _.groupBy(response.loadbalancers, "type");
                if(_.has(lbs_by_type, "tcp")){
                    _.each(lbs_by_type.tcp, function(loadbalancer){
                        content.push("");
                        content.push(["listen ", loadbalancer.application, " :", loadbalancer.listen_port].join(""));
                        content.push("\tmode tcp");
                        content.push(["\tserver local 127.0.0.1", response.applications[loadbalancer.application].discovery_port].join(":"));
                    });
                }

                if(_.has(lbs_by_type, "http")){
                    var http_by_port = _.groupBy(lbs_by_type.http, "listen_port");
                    _.each(http_by_port, function(loadbalancers, listen_port){
                        content.push("");
                        content.push(["frontend http", listen_port].join("_"));
                        content.push("\tmode http");
                        content.push(["\tbind *", listen_port].join(":"));
                        _.each(loadbalancers, function(loadbalancer){
                            _.each(loadbalancer.domains, function(domain){
                                content.push(["\tacl", ["host", loadbalancer.application].join("_"), "hdr_beg(host)", "-i", domain].join(" "));
                            });
                        });
                        content.push("");
                        _.each(loadbalancers, function(loadbalancer){
                            content.push(["\tuse_backend", ["application", loadbalancer.application].join("_"), "if", ["host", loadbalancer.application].join("_")].join(" "));
                        });
                    });
                }

                _.each(response.applications, function(application, application_name){
                    content.push("");
                    content.push(["backend", ["application", application_name].join("_")].join(" "));
                    content.push("\tmode http");
                    content.push(["\tserver local 127.0.0.1", application.discovery_port].join(":"));
                });

                content = _.flatten(content).join("\n");
                fs.writeFile(haproxy.config_location, content, function(err){
                    if(err)
                        process.stderr.write(err.message);

                    if(_.isUndefined(self.process))
                        self.start();
                    else
                        self.reload();
                });
            }
            else
                process.stderr.write("Error fetching ContainerShip applications / hosts");
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

var containership = {

    api_url: ["leaders", process.env.CS_CLUSTER_ID, "containership"].join("."),

    get_applications: function(fn){
        containership.resolve_url(containership.api_url, function(url){
            var options = {
                url: ["http://", url, ":8080/v1/applications"].join(""),
                method: "GET",
                json: true,
                timeout: 5000
            }

            return request(options, function(err, response){
                if(err)
                    return fn(err);
                else
                    return fn(null, response.body);
            });
        });
    },

    get_loadbalancers: function(fn){
        var options = {
            url: ["https://api.containership.io", "v1", process.env.CONTAINERSHIP_CLOUD_ORGANIZATION, "loadbalancers"].join("/"),
            method: "GET",
            json: true,
            headers: {
                "X-ContainerShip-Cloud-Organization": process.env.CONTAINERSHIP_CLOUD_ORGANIZATION,
                "X-ContainerShip-Cloud-API-Key": process.env.CONTAINERSHIP_CLOUD_API_KEY
            }
        }

        return request(options, function(err, response){
            if(err)
                return fn(err);
            else
                return fn(null, response.body);
        });
    },

    resolve_url: function(url, fn){
        var question = dns.Question({
          name: url,
          type: 'A',
        });

        var req = dns.Request({
            question: question,
            server: { address: '127.0.0.1', port: 53, type: 'udp' },
            timeout: 2000
        });

        req.on("timeout", function(){
            return fn();
        });

        req.on("message", function (err, answer) {
            var address;
            answer.answer.forEach(function(a){
                address = a.address;
            });

            return fn(address);
        });

        req.send();
    }
}

haproxy.write_config();
setInterval(function(){
    haproxy.write_config();
}, 15000);
