var _ = require("lodash");

module.exports = {

    global: function(options){
        return [
            "global",
            ["\tmaxconn", options.max_connections].join(" "),
            ""
        ]
    },

    defaults: function(options){
        return _.flatten([
            "defaults",
            "\tlog global",
            "\tmode tcp",
            _.map(options.default_options, function(opt){
                return ["\toption", opt].join(" ");
            }),
            "\tretries 3",
            ["\ttimeout connect", options.connect_timeout].join(" "),
            ["\ttimeout client", options.client_timeout].join(" "),
            ["\ttimeout server", options.server_timeout].join(" "),
            ""
        ]);
    },

    stats: function(){
        return [
            "listen stats :1738",
            "\tmode http",
            "\tstats enable",
            "\tstats hide-version",
            "\tstats uri /",
            ""
        ]
    },

    tcp_listen: function(options){
        return [
            ["listen ", options.id, " :", options.port].join(""),
            "\tmode tcp",
            ["\tserver local 127.0.0.1", options.discovery_port].join(":"),
            ""
        ]
    },

    http_frontend: function(options){
        var acls = [];
        var backends = [];

        _.each(options.loadbalancers, function(loadbalancer){
            _.each(loadbalancer.domains, function(domain){
                acls.push(["\tacl", ["host", loadbalancer.application].join("_"), "hdr_beg(host)", "-i", domain].join(" "));
            });
            if(loadbalancer.force_https){
                acls.push(["\tredirect scheme https code 301 if is_proxied_http", ["host", loadbalancer.application].join("_")].join(" "));
                acls.push(["\tredirect scheme https code 301 if is_not_proxied_http", ["host", loadbalancer.application].join("_")].join(" "));
            }
        });

        _.each(options.loadbalancers, function(loadbalancer){
            backends.push(["\tuse_backend", ["application", loadbalancer.application].join("_"), "if", ["host", loadbalancer.application].join("_")].join(" "));
        });

        return _.flatten([
            ["frontend http", options.port].join("_"),
            "\tmode http",
            ["\tbind *", options.port].join(":"),
            "\tacl is_proxied_http hdr(X-Forwarded-Proto) http",
            "\tacl is_not_proxied_http hdr_cnt(X-Forwarded-Proto) 0",
            acls,
            "",
            backends,
            ""
        ]);
    },

    backend: function(options){
        return [
            ["backend", ["application", options.id].join("_")].join(" "),
            "\tmode http",
            ["\tserver local 127.0.0.1", options.port].join(":"),
            ""
        ]
    }

}
