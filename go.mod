module github.com/pulumi/pulumi-cloud

go 1.15

require (
	github.com/onsi/ginkgo v1.16.1 // indirect
	github.com/onsi/gomega v1.11.0 // indirect
	github.com/pulumi/pulumi/pkg/v3 v3.0.0
	github.com/stretchr/testify v1.6.1
	gopkg.in/airbrake/gobrake.v2 v2.0.9 // indirect
	gopkg.in/gemnasium/logrus-airbrake-hook.v2 v2.1.2 // indirect
)

replace (
	github.com/Nvveen/Gotty => github.com/ijc25/Gotty v0.0.0-20170406111628-a8b993ba6abd
	github.com/golang/glog => github.com/pulumi/glog v0.0.0-20180820174630-7eaa6ffb71e4
)
