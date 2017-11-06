// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";

import { externalSecurityGroups, externalSubnets, externalVpcId, usePrivateNetwork } from "../config";
import { getAwsAz } from "./aws";

export interface NetworkArgs {
    numberOfAvailabilityZones?: number;
    privateSubnets?: boolean;
}

export class Network {
    public readonly numberOfAvailabilityZones: number;
    public readonly vpcId: pulumi.Computed<string>;
    public readonly privateSubnets: boolean;
    public readonly securityGroupIds: pulumi.Computed<string>[];
    public readonly subnetIds: pulumi.Computed<string>[];
    public readonly publicSubnetIds: pulumi.Computed<string>[];
    public readonly internetGateway?: aws.ec2.InternetGateway;
    public readonly natGateways?: aws.ec2.NatGateway[];

    constructor(name: string, args: NetworkArgs) {
        // IDEA: default to the number of availability zones in this region, rather than 2.  To do this requires
        // invoking the provider, which requires that we "go async" at a very inopportune time here.  When
        // pulumi/pulumi#331 lands, this will be much easier to do, and we can improve this situation.
        this.numberOfAvailabilityZones = args.numberOfAvailabilityZones || 2;
        if (this.numberOfAvailabilityZones < 1 || this.numberOfAvailabilityZones > 2) {
            throw new Error(
                `Unsupported number of availability zones for network: ${this.numberOfAvailabilityZones}`);
        }
        this.privateSubnets = args.privateSubnets || false;

        const vpc = new aws.ec2.Vpc(`${name}-vpc`, {
            cidrBlock: "10.10.0.0/16",
            enableDnsHostnames: true,
            enableDnsSupport: true,
            tags: {
                Name: "Pulumi VPC",
            },
        });
        this.vpcId = vpc.id;
        this.securityGroupIds = [ vpc.defaultSecurityGroupId ];

        this.internetGateway = new aws.ec2.InternetGateway(`${name}-internetGateway`, {
            vpcId: vpc.id,
        });

        const publicRouteTable = new aws.ec2.RouteTable(`${name}-publicRouteTable`, {
            vpcId: vpc.id,
            route: [
                {
                    cidrBlock: "0.0.0.0/0",
                    gatewayId: this.internetGateway.id,
                },
            ],
        });

        this.natGateways = [];
        this.subnetIds = [];
        this.publicSubnetIds = [];

        for (let i = 0; i < this.numberOfAvailabilityZones; i++) {
            // Create the subnet for this AZ - either - either public or private
            const subnet = new aws.ec2.Subnet(`${name}-subnet${i}`, {
                vpcId: vpc.id,
                availabilityZone: getAwsAz(i),
                cidrBlock: `10.10.${i}.0/24`,         // IDEA: Consider larger default CIDR block sizing
                mapPublicIpOnLaunch: !this.privateSubnets, // Only assign public IP if we are exposing public subnets
            });
            this.subnetIds.push(subnet.id);

            // We will use a different route table for this subnet depending on
            // whether we are in a public or private subnet
            let subnetRouteTable: aws.ec2.RouteTable;

            if (this.privateSubnets) {
                // We need a public subnet for the NAT Gateway
                const natGatewayPublicSubnet = new aws.ec2.Subnet(`${name}-nat-subnet${i}`, {
                    vpcId: vpc.id,
                    availabilityZone: getAwsAz(i),
                    cidrBlock: `10.10.${i+64}.0/24`, // Use top half of the subnet space
                    mapPublicIpOnLaunch: true,        // Always assign a public IP in NAT subnet
                });
                this.publicSubnetIds.push(natGatewayPublicSubnet.id);

                // And we need to route traffic from that public subnet to the Internet Gateway
                const natGatewayRoutes = new aws.ec2.RouteTableAssociation(`${name}-nat-publicRouteTable${i}`, {
                    subnetId: natGatewayPublicSubnet.id,
                    routeTableId: publicRouteTable.id,
                });

                // We need an Elastic IP for the NAT Gateway
                const eip = new aws.ec2.Eip(`${name}-eip${i}`);

                // And we need a NAT Gateway to be able to access the Internet
                const natGateway = new aws.ec2.NatGateway(`${name}-natGateway${i}`, {
                    subnetId: natGatewayPublicSubnet.id,
                    allocationId: eip.id,
                });
                this.natGateways.push(natGateway);

                const natRouteTable = new aws.ec2.RouteTable(`${name}-nat-privateRouteTable${i}`, {
                    vpcId: vpc.id,
                    route: [
                        {
                            cidrBlock: "0.0.0.0/0",
                            natGatewayId: natGateway.id,
                        },
                    ],
                });

                // Route through the NAT gateway for the private subnet
                subnetRouteTable = natRouteTable;
            } else /* !privateSubnets */{
                // Route directly to the Internet Gateway for the public subnet
                subnetRouteTable = publicRouteTable;
                // The subnet is public, so register it as our public subnet
                this.publicSubnetIds.push(subnet.id);
            }

            const routTableAssociation = new aws.ec2.RouteTableAssociation(`${name}-subnet${i}RouteTable`, {
                subnetId: subnet.id,
                routeTableId: subnetRouteTable.id,
            });
        }
    }
}
