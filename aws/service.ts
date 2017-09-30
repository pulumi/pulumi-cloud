// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import { ecsClusterARN } from "./config";

type ECSKernelCapability = "ALL" | "AUDIT_CONTROL" | "AUDIT_WRITE" | "BLOCK_SUSPEND" | "CHOWN" | "DAC_OVERRIDE" |
    "DAC_READ_SEARCH" | "FOWNER" | "FSETID" | "IPC_LOCK" | "IPC_OWNER" | "KILL" | "LEASE" | "LINUX_IMMUTABLE" |
    "MAC_ADMIN" | "MAC_OVERRIDE" | "MKNOD" | "NET_ADMIN" | "NET_BIND_SERVICE" | "NET_BROADCAST" | "NET_RAW" |
    "SETFCAP" | "SETGID" | "SETPCAP" | "SETUID" | "SYS_ADMIN" | "SYS_BOOT" | "SYS_CHROOT" | "SYS_MODULE" |
    "SYS_NICE" | "SYS_PACCT" | "SYS_PTRACE" | "SYS_RAWIO" | "SYS_RESOURCE" | "SYS_TIME" | "SYS_TTY_CONFIG" |
    "SYSLOG" | "WAKE_ALARM";

type ECSLogDriver = "json-file" | "syslog" | "journald" | "gelf" | "fluentd" | "awslogs" | "splunk";

interface ECSContainerDefinition {
    command?: string[];
    cpu?: number;
    disableNetworking?: boolean;
    dnsSearchDomains?: boolean;
    dnsServers?: string[];
    dockerLabels?: {[label: string]: string};
    dockerSecurityOptions?: string[];
    entryPoint?: string[];
    environment?: { name: string; value: string; }[];
    essential?: boolean;
    extraHosts?: {hostname: string; ipAddress: string}[];
    hostname?: string;
    image?: string;
    links?: string[];
    linuxParameters?: {capabilities?: { add?: ECSKernelCapability[]; drop?: ECSKernelCapability[]}};
    logConfiguration?: { logDriver: ECSLogDriver; options?: {[key: string]: string}};
}

export class Service implements cloud.Service {
    name: string;

    getHostAndPort: (containerIndex: number, containerPort: number) => Promise<string>;

    constructor(name: string, ...containers: cloud.Container[]) {
        if (!ecsClusterARN) {
            throw new Error("Cannot create 'Service'.  Missing cluster config 'cloud-aws:config:ecsClusterARN'");
        }
        this.name = name;
        let logGroup = new aws.cloudwatch.LogGroup(name, {});
        let taskDefinition = new aws.ecs.TaskDefinition(name, {
            family: name,
            containerDefinitions: logGroup.id.then(logGroupId=> JSON.stringify(containers.map(container => ({
                name: container.name,
                image: container.image,
                memoryReservation: container.memory,
                portMappings: container.portMappings,
                logConfiguration: {
                    logDriver: "awslogs",
                    options: {
                        "awslogs-group": logGroupId,
                        "awslogs-region": "us-east-1",
                        "awslogs-stream-prefix": container.name,
                    },
                },
            } as ECSContainerDefinition)))),
        });
        let service = new aws.ecs.Service(name, {
            desiredCount: 1,
            taskDefinition:  taskDefinition.arn,
            cluster: ecsClusterARN,
        });
        let serviceName = service.name;

        this.getHostAndPort = async (containerIndex, containerPort) => {
            let awssdk = require("aws-sdk");
            let ecs = new awssdk.ECS();
            let ec2 = new awssdk.EC2();
            // Get all tasks associated with this service
            let listTasksResp = await ecs.listTasks({serviceName: serviceName as any}).promise();
            if (!listTasksResp.taskArns || listTasksResp.taskArns.length < 1) {
                console.error(`Error: ${listTasksResp}`);
                throw new Error("No tasks in service");
            }
            let taskArn = listTasksResp.taskArns[0];
            // Get metadata for the task
            let describeTasksResp = await ecs.describeTasks({tasks: [taskArn]}).promise();
            if (!describeTasksResp.tasks || describeTasksResp.tasks.length < 1) {
                console.error(`Error: ${describeTasksResp.failures}`);
                throw new Error("No tasks in service");
            }
            let task = describeTasksResp.tasks[0];
            let containerInstanceArn = task.containerInstanceArn!;
            // Get the containers instance that this task is running o
            let ciResp = await ecs.describeContainerInstances({ containerInstances: [containerInstanceArn]}).promise();
            if (!ciResp.containerInstances || ciResp.containerInstances.length < 1) {
                console.error(`Error: ${ciResp.failures}`);
                throw new Error("No instances running service");
            }
            let instanceId = ciResp.containerInstances[0].ec2InstanceId!;
            // Get the metadata about the EC2 instance associated with the container instance
            let instancesResp = await ec2.describeInstances({InstanceIds: [instanceId]}).promise();
            if (!instancesResp.Reservations || instancesResp.Reservations.length < 1) {
                console.error(`Error: ${instancesResp}`);
                throw new Error("No instances running service");
            }
            let ipAddress = instancesResp.Reservations[0].Instances![0].PublicIpAddress!;
            let networkBindings = task.containers![containerIndex].networkBindings!;
            // Find the network binding and return it
            for (let binding of networkBindings) {
                if (binding.containerPort === containerPort) {
                    return `${ipAddress}:${binding.hostPort}`;
                }
            }
            // If no network binding matching the request, throw an error
            throw new Error(`No bound host/port found for container ${containerIndex} port ${containerPort}`);
        };
    }

}
