module github.com/pulumi/pulumi-cloud

go 1.13

require (
	github.com/docker/docker v1.13.1 // indirect
	github.com/pulumi/pulumi v1.9.2-0.20200130191051-01db3e28312c
	github.com/stretchr/testify v1.4.1-0.20191106224347-f1bd0923b832
)

replace (
	github.com/Azure/go-autorest => github.com/Azure/go-autorest v12.4.3+incompatible
	github.com/Nvveen/Gotty => github.com/ijc25/Gotty v0.0.0-20170406111628-a8b993ba6abd
	github.com/golang/glog => github.com/pulumi/glog v0.0.0-20180820174630-7eaa6ffb71e4
)
