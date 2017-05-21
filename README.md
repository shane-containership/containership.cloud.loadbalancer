# containership.cloud.loadbalancer
Containership Cloud Loadbalancer Docker Image

## About

### Description
Containership loadbalancer Docker image

### Configuration
`NGINX_CLIENT_BODY_BUFFER_SIZE` - buffer size for reading client request body (default: 128, unit: 'k')
`NGINX_CLIENT_MAX_BODY_SIZE` - maximum allowed size of the client request body (default: 10, unit: 'm')
`NGINX_ERR_LOG_LEVEL` - nginx error log level (default: warn)
`NGINX_HTTP_LOG_FORMAT` - nginx error log level (default: '$host $remote_addr [$time_local] "$request" $status $http_referer "$http_user_agent"')
`NGINX_WORKER_CONNECTIONS` - nginx error log level (default: 512)
`NGINX_WORKER_PROCESSES` - nginx error log level (default: 4)
`NGINX_PROXY_CONNECT_TIMEOUT` - timeout for establishing a connection with a proxied server (default: 60, unit: 's')
`NGINX_PROXY_READ_TIMEOUT` - timeout for reading a response from the proxied server (default: 60, unit: 's')
`NGINX_PROXY_SEND_TIMEOUT` - timeout for transmitting a request to the proxied server (default: 60, unit: 's')
`NGINX_PROXY_TIMEOUT` - timeout between two successive read or write operations on client or proxied server connections (default: 60, unit: 's')
`NGINX_PROXY_BUFFERS_SIZE` - size of buffer used for reading response from proxied server (default: 32, unit: 'k')
`NGINX_PROXY_BUFFERS_NUMBER` - number of buffers used for reading response from proxied server (default: 4)

### Author
Containership Developers - developers@containership.io

## Contributing
Pull requests and issues are encouraged!
