module github.com/pulumi/pulumi-cloud

go 1.16

require (
	github.com/pulumi/pulumi/pkg/v3 v3.0.0
	github.com/stretchr/testify v1.6.1
	golang.org/x/sys v0.0.0-20210112080510-489259a85091 // indirect
	golang.org/x/tools v0.0.0-20201224043029-2b0845dc783e // indirect
	gopkg.in/airbrake/gobrake.v2 v2.0.9 // indirect
	gopkg.in/gemnasium/logrus-airbrake-hook.v2 v2.1.2 // indirect
	gopkg.in/yaml.v2 v2.4.0 // indirect
)

replace (
	github.com/Nvveen/Gotty => github.com/ijc25/Gotty v0.0.0-20170406111628-a8b993ba6abd
	github.com/golang/glog => github.com/pulumi/glog v0.0.0-20180820174630-7eaa6ffb71e4
)
