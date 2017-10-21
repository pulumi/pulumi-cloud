// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";

import { createVpc } from "../config";
import { getAwsAz } from "./aws";

export interface NetworkArgs {
    numberOfAvailabilityZones: number;
    privateSubnets: boolean;
}

export class Network {
    public vpc: aws.ec2.Vpc;
    public subnets: aws.ec2.Subnet[];
    public internetGateway: aws.ec2.InternetGateway;
    public natGateways: aws.ec2.NatGateway[];

    constructor(name: string, args: NetworkArgs) {
        const numberOfAvailabilityZones = args.numberOfAvailabilityZones || 2;
        if (numberOfAvailabilityZones < 1 || numberOfAvailabilityZones > 2) {
            throw new Error(`Unsupported number of availability zones for network: ${numberOfAvailabilityZones}`);
        }
        const privateSubnets = args.privateSubnets || false;

        this.vpc = new aws.ec2.Vpc(`${name}-vpc`, {
            cidrBlock: "10.10.0.0/16",
            enableDnsHostnames: true,
            enableDnsSupport: true,
            tags: {
                Name: "Pulumi VPC",
            },
        });

        this.internetGateway = new aws.ec2.InternetGateway(`${name}-internetGateway`, {
            vpcId: this.vpc.id,
        });

        const publicRouteTable = new aws.ec2.RouteTable(`${name}-publicRouteTable`, {
            vpcId: this.vpc.id,
            route: [
                {
                    cidrBlock: "0.0.0.0/0",
                    gatewayId: this.internetGateway.id,
                },
            ],
        });

        this.subnets = [];
        this.natGateways = [];
        const routeTableAssociations = [];

        for (let i = 0; i < numberOfAvailabilityZones; i++) {

            // Create the subnet for this AZ - either - either public or private
            this.subnets.push(new aws.ec2.Subnet(`${name}-subnet${i}`, {
                vpcId: this.vpc.id,
                availabilityZone: getAwsAz(i),
                cidrBlock: `10.10.${i}.0/24`,         // IDEA: Consider larger default CIDR block sizing
                mapPublicIpOnLaunch: !privateSubnets, // Only assign public IP if we are exposing public subnets
            }));

            // We will use a different route table for this subnet depending on
            // whether we are in a public or private subnet
            let subnetRouteTable: aws.ec2.RouteTable;

            if (privateSubnets) {

                // We need a public subnet for the NAT Gateway
                const natGatewayPublicSubnet = new aws.ec2.Subnet(`${name}-nat-subnet${i}`, {
                    vpcId: this.vpc.id,
                    availabilityZone: getAwsAz(i),
                    cidrBlock: `10.10.${i+64}.0/24`, // Use top half of the subnet space
                    mapPublicIpOnLaunch: true,        // Always assign a public IP in NAT subnet
                });

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
                    vpcId: this.vpc.id,
                    route: [
                        {
                            cidrBlock: "0.0.0.0/0",
                            natGatewayId: natGateway.id,
                        },
                    ],
                });

                // Route through the NAT gateway for the private subnet
                subnetRouteTable = natRouteTable;
            } else {
                // Route directly to the Internet Gateway for the public subnet
                subnetRouteTable = publicRouteTable;
            }

            routeTableAssociations.push(new aws.ec2.RouteTableAssociation(`${name}-subnet${i}RouteTable`, {
                subnetId: this.subnets[i].id,
                routeTableId: subnetRouteTable.id,
            }));
        }
    }
}

export let privateNetwork: Network | undefined;
if (createVpc) {
    privateNetwork = new Network(`lukenet`, {
        numberOfAvailabilityZones: 1,
        privateSubnets: true,
    });
}
