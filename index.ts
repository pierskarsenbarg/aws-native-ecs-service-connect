import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

const vpc = new awsx.ec2.Vpc("vpc", {
    cidrBlock: "10.0.0.0/16",
    numberOfAvailabilityZones: 2,
    subnetSpecs: [{
        type: awsx.ec2.SubnetType.Public,
        name: "public-ecs-subnet",
    }],
    tags: {
        name: "pk-ecs-connect"
    },
    natGateways: {
        strategy: "None"
    }
});

// const repo = new awsx.ecr.Repository("repo");

// const image = new awsx.ecr.Image("app-image", {
//     repositoryUrl: repo.url,
//     path: "./app"
// })

const cluster = new aws.ecs.Cluster("pk-cluster");

const lbSecurityGroup = new aws.ec2.SecurityGroup("lbSg", {
    vpcId: vpc.vpcId,
    ingress: [{
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"]
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"]
    }]
});

const taskSecurityGroup = new aws.ec2.SecurityGroup("taskSg", {
    vpcId: vpc.vpcId,
    ingress: [{
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        securityGroups: [lbSecurityGroup.id]
    }],
    egress: [{
        protocol: "-1",
        fromPort: 0,
        toPort: 0,
        cidrBlocks: ["0.0.0.0/0"]
    }]
})

const lb = new aws.lb.LoadBalancer("lb", {
    securityGroups: [lbSecurityGroup.id],
    subnets: vpc.publicSubnetIds,
});

const tg = new aws.lb.TargetGroup("tg", {
    port: 80,
    protocol: "HTTP",
    targetType: "ip",
    vpcId: vpc.vpcId,
});

const listener = new aws.lb.Listener("listener", {
    loadBalancerArn: lb.arn,
    port: 80,
    defaultActions: [{
        type: "forward",
        targetGroupArn: tg.arn
    }]
});

const role = new aws.iam.Role("role", {
    assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal(aws.iam.Principals.EcsTasksPrincipal), // might be aws.iam.Principals.EcsPrincipal
    managedPolicyArns: [aws.iam.ManagedPolicy.AmazonECSTaskExecutionRolePolicy]
});

// const appTaskDefinition = new aws.ecs.TaskDefinition("appTd", {
//     family: "app-demo",
//     cpu: "256",
//     memory: "512",
//     networkMode: "awsvpc",
//     requiresCompatibilities: ["FARGATE"],
//     executionRoleArn: role.arn,
//     containerDefinitions: JSON.stringify([{
//         name: "app",
//         image: image.imageUri,
//         portMappings: [{
//             containerPort: 3000,
//             hostPort: 80,
//             protocol: "tcp"
//         }],
//         logConfiguration: {
//             logDriver: "awslogs",
//             options: {
//                 "awslogs-create-group": "true",
//                 "awslogs-group": "nginx-fargate",
//                 "awslogs-region": "eu-west-1",
//                 "awslogs-stream-prefix": "nginx"
//             }
//         },
//     }])
// });

const taskdefinition = new aws.ecs.TaskDefinition("td", {
    family: "ecs-connect",
    cpu: "256",
    memory: "512",
    networkMode: "awsvpc",
    requiresCompatibilities: ["FARGATE"],
    executionRoleArn: role.arn,
    containerDefinitions: JSON.stringify([{
        name: "nginx",
        image: "nginx:latest",
        portMappings: [{
            containerPort: 80,
            hostPort: 80,
            protocol: "tcp"
        }],
        
    }])
});

const service = new aws.ecs.Service("service", {
    cluster: cluster.arn,
    desiredCount: 1,
    launchType: "FARGATE",
    taskDefinition: taskdefinition.arn,
    networkConfiguration: {
        assignPublicIp: true,
        subnets: vpc.publicSubnetIds,
        securityGroups: [taskSecurityGroup.id]
    },
    loadBalancers: [{
        targetGroupArn: tg.arn,
        containerName: "nginx",
        containerPort: 80
    }],
}, {dependsOn: [listener]});

// const appService = new aws.ecs.Service("app-service", {
//     cluster: cluster.arn,
//     desiredCount: 1,
//     launchType: "FARGATE",
//     taskDefinition: appTaskDefinition.arn,
//     networkConfiguration: {
//         assignPublicIp: true,
//         subnets: vpc.publicSubnetIds,
//         securityGroups: [taskSecurityGroup.id]
//     },
//     loadBalancers
// })

export const url = lb.dnsName;