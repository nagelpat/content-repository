"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogseriesStack = void 0;
const cdk = require("aws-cdk-lib");
const lambda = require("aws-cdk-lib/aws-lambda");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const codecommit = require("aws-cdk-lib/aws-codecommit");
const amplify_alpha = require("@aws-cdk/aws-amplify-alpha");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const ssm = require("aws-cdk-lib/aws-ssm");
const triggers = require("aws-cdk-lib/triggers");
class BlogseriesStack extends cdk.Stack {
    constructor(scope, id, props) {
        var _a, _b, _c, _d;
        super(scope, id, props);
        const path = require("path");
        const userPool = new cognito.UserPool(this, "userpool", {
            userPoolName: "blog-user-pool",
            selfSignUpEnabled: true,
            signInAliases: {
                username: true,
            },
            autoVerify: {
                email: true,
            },
            passwordPolicy: {
                minLength: 8,
                requireLowercase: false,
                requireDigits: false,
                requireUppercase: false,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.NONE,
            signInCaseSensitive: false,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // User Pool Client
        const userPoolClient = new cognito.UserPoolClient(this, "blog-userpool-client", {
            userPool,
            authFlows: {
                adminUserPassword: true,
                custom: true,
                userSrp: true,
            },
            supportedIdentityProviders: [
                cognito.UserPoolClientIdentityProvider.COGNITO,
            ],
        });
        userPoolClient.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        // create Cognito Identity Pool id
        const identityPool = new cognito.CfnIdentityPool(this, "blog-identity-pool", {
            identityPoolName: "blog-identity-pool",
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: userPoolClient.userPoolClientId,
                    providerName: userPool.userPoolProviderName,
                },
            ],
        });
        identityPool.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        // default role and permissions for unauthenticated users
        const cognitoUnauthenticatedRole = new iam.Role(this, "anonymous-group-role", {
            description: "Default role for anonymous users",
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "unauthenticated",
                },
            }, "sts:AssumeRoleWithWebIdentity"),
        });
        cognitoUnauthenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "mobileanalytics:PutEvents",
                "cognito-sync:*"
            ],
            resources: ["*"],
        }));
        // default role and permissions for authenticated users
        const cognitoAuthenticatedRole = new iam.Role(this, "users-group-role", {
            description: "Default role for authenticated users",
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "authenticated",
                },
            }, "sts:AssumeRoleWithWebIdentity"),
        });
        cognitoAuthenticatedRole.addToPolicy(new iam.PolicyStatement({
            effect: iam.Effect.ALLOW,
            actions: [
                "mobileanalytics:PutEvents",
                "cognito-sync:*",
                "cognito-identity:*"
            ],
            resources: ["*"],
        }));
        // choose (preferred) role for authenticated users from ID token 
        new cognito.CfnIdentityPoolRoleAttachment(this, "identity-pool-role-attachment", {
            identityPoolId: identityPool.ref,
            roles: {
                authenticated: cognitoAuthenticatedRole.roleArn,
                unauthenticated: cognitoUnauthenticatedRole.roleArn,
            },
            roleMappings: {
                mapping: {
                    type: "Token",
                    ambiguousRoleResolution: "Deny",
                    identityProvider: `cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}:${userPoolClient.userPoolClientId}`,
                },
            },
        });
        //Declare the User Pool Group IAM roles
        const AdminGroupIAMrole = new iam.Role(this, "AdminRole", {
            assumedBy: new iam.CompositePrincipal(new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
            }), new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`)),
        });
        const C1groupIAMrole = new iam.Role(this, "C1Role", {
            assumedBy: new iam.CompositePrincipal(new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
            }), new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`)),
        });
        const C2groupIAMrole = new iam.Role(this, "C2Role", {
            assumedBy: new iam.CompositePrincipal(new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
            }), new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`)),
        });
        //Declare the User Pool Groups
        const cfnUserPoolGroupAdmin = new cognito.CfnUserPoolGroup(this, "Admin", {
            userPoolId: userPool.userPoolId,
            description: "Admin group",
            groupName: "Admin",
            precedence: 1,
            roleArn: AdminGroupIAMrole.roleArn,
        });
        const cfnUserPoolGroupC1 = new cognito.CfnUserPoolGroup(this, "C1", {
            userPoolId: userPool.userPoolId,
            description: "C1 group",
            groupName: "C1",
            precedence: 2,
            roleArn: C1groupIAMrole.roleArn,
        });
        const cfnUserPoolGroupC2 = new cognito.CfnUserPoolGroup(this, "C2", {
            userPoolId: userPool.userPoolId,
            description: "C2 group",
            groupName: "C2",
            precedence: 3,
            roleArn: C2groupIAMrole.roleArn,
        });
        // create s3 bucket to upload documents
        const s3Bucket = new s3.Bucket(this, "s3-bucket", {
            removalPolicy: cdk.RemovalPolicy.DESTROY,
            autoDeleteObjects: true,
            versioned: false,
            publicReadAccess: false,
            encryption: s3.BucketEncryption.S3_MANAGED,
            cors: [
                {
                    allowedMethods: [
                        s3.HttpMethods.GET,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.PUT,
                    ],
                    //updated as part of the build and deploy pipeline of the Amplify hosted front-end application
                    allowedOrigins: ["*"],
                    allowedHeaders: ["*"],
                },
            ],
        });
        // create a S3 put policy statement
        const s3PutObjectPolicy = new iam.PolicyStatement({
            actions: ["s3:PutObject", "s3:PutObjectTagging"],
            resources: [`${s3Bucket.bucketArn}/*`],
        });
        const s3ListBucketPolicy = new iam.PolicyStatement({
            actions: ["s3:ListBucket"],
            resources: [`${s3Bucket.bucketArn}`],
        });
        const assumeRoleCognitoPolicy = new iam.PolicyStatement({
            //TODO - Fix resource with roles to assume and add trust relationship
            actions: ["sts:AssumeRole", "sts:TagSession"],
            effect: iam.Effect.ALLOW,
            resources: [
                "arn:aws:iam::" + `${cdk.Stack.of(this).account}` + ":role/*",
            ],
        });
        const cognitoIDPAdminPolicy = new iam.PolicyStatement({
            actions: ["cognito-idp:AdminListGroupsForUser"],
            resources: [`${userPool.userPoolArn}`],
        });
        C1groupIAMrole.addToPolicy(s3PutObjectPolicy);
        C1groupIAMrole.addToPolicy(s3ListBucketPolicy);
        C2groupIAMrole.addToPolicy(s3PutObjectPolicy);
        C2groupIAMrole.addToPolicy(s3ListBucketPolicy);
        s3Bucket.grantReadWrite(AdminGroupIAMrole);
        // creation of the source control repository for the react frontend app hosted on Amplify
        const repository = new codecommit.Repository(this, "frontend-code-repo", {
            repositoryName: "frontend-code",
            code: codecommit.Code.fromDirectory(path.join(__dirname, "/../../react-ui/"), "main"),
            description: "code repository for react frontend application",
        });
        repository.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        // Creation of SSM Parm for Amplify Auth backend configuration
        const ampfliyAuthParam = new ssm.StringParameter(this, "ampfliyBackendAuthParam", {
            allowedPattern: ".*",
            description: "Amplify Auth Backend Configuration",
            parameterName: "ampfliyBackendAuthParam",
            stringValue: `{"BlogseriesStack":{"bucketName": "${s3Bucket.bucketName}","userPoolClientId": "${userPoolClient.userPoolClientId}","region": "${cdk.Stack.of(this).region}","userPoolId": "${userPool.userPoolId}","identityPoolId": "${identityPool.ref}"}}`,
            tier: ssm.ParameterTier.STANDARD,
        });
        // Creation of custom execution role for amplify app
        const pullCodeCommitPolicy = new iam.PolicyDocument({
            statements: [
                new iam.PolicyStatement({
                    resources: [`${repository.repositoryArn}`],
                    actions: ["codecommit:GitPull"],
                }),
            ],
        });
        const amplifyAuthParamPolicy = new iam.PolicyDocument({
            statements: [
                new iam.PolicyStatement({
                    resources: [`${ampfliyAuthParam.parameterArn}`],
                    actions: [
                        "ssm:GetParametersByPath",
                        "ssm:GetParameters",
                        "ssm:GetParameter",
                    ],
                }),
            ],
        });
        const amplifyExecRole = new iam.Role(this, "amplifyExecutionRole", {
            assumedBy: new iam.ServicePrincipal("amplify.amazonaws.com"),
            description: "Custom role for Amplify app with read access to SSM Parameter Store",
            inlinePolicies: {
                AmplifyAuthParamPolicy: amplifyAuthParamPolicy,
                PullCodeCommitPolicy: pullCodeCommitPolicy,
            },
        });
        // Creation of Amplify App
        const amplifyApp = new amplify_alpha.App(this, "ReactFrontendApp", {
            sourceCodeProvider: new amplify_alpha.CodeCommitSourceCodeProvider({
                repository,
            }),
            role: amplifyExecRole,
            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                // Alternatively add a `amplify.yml` to the repo
                version: "1.0",
                frontend: {
                    phases: {
                        preBuild: {
                            commands: [
                                "npm install",
                                "aws ssm get-parameter --name 'ampfliyBackendAuthParam' --query 'Parameter.Value' --output text > ./src/amplify_auth_config.json",
                                "aws ssm get-parameter --name 'apiGatewayEndpointParam' --query 'Parameter.Value' --output text > ./src/components/api_endpoint.json",
                            ],
                        },
                        build: {
                            commands: ["npm run build"],
                        },
                        postBuild: {
                            commands: [
                                "CORS_RULE=$( aws ssm get-parameter --name 's3CorsRuleParam' --query 'Parameter.Value' --output text )",
                                "BUCKET_NAME=$( aws ssm get-parameter --name 's3BucketNameParam' --query 'Parameter.Value' --output text )",
                                'aws s3api put-bucket-cors --bucket "$BUCKET_NAME" --cors-configuration "$CORS_RULE"',
                            ],
                        },
                    },
                    artifacts: {
                        baseDirectory: "build",
                        files: ["**/*"],
                    },
                    cache: {
                        commands: ["node_modules/**/*"],
                    },
                },
            }),
        });
        amplifyApp.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        // connect to main branch of the code repo
        const mainBranch = amplifyApp.addBranch("main", {
            autoBuild: true,
            branchName: "main",
        });
        // URL used for CORS origin
        const allowOriginURL = "https://" + mainBranch.branchName + "." + amplifyApp.defaultDomain;
        // Create Lambda functions (business logic)
        const listFileLambda = new lambda.Function(this, "ListFileLambda", {
            environment: {
                uploadBucketName: s3Bucket.bucketName,
                allowOrigins: allowOriginURL,
                region: cdk.Stack.of(this).region,
            },
            code: lambda.Code.fromAsset("lambdas"),
            handler: "list_file.lambda_handler",
            timeout: cdk.Duration.seconds(30),
            runtime: lambda.Runtime.PYTHON_3_8,
        });
        const presignedURLLambda = new lambda.Function(this, "PresignedURL", {
            environment: {
                uploadBucketName: s3Bucket.bucketName,
                allowOrigins: allowOriginURL,
                region: cdk.Stack.of(this).region,
            },
            code: lambda.Code.fromAsset("lambdas"),
            handler: "presignedURL.lambda_handler",
            timeout: cdk.Duration.seconds(30),
            runtime: lambda.Runtime.PYTHON_3_8,
        });
        (_a = presignedURLLambda.role) === null || _a === void 0 ? void 0 : _a.attachInlinePolicy(new iam.Policy(this, "assume-role-presigned-policy", {
            statements: [assumeRoleCognitoPolicy],
        }));
        (_b = presignedURLLambda.role) === null || _b === void 0 ? void 0 : _b.attachInlinePolicy(new iam.Policy(this, "cognito-user-group-policy", {
            statements: [cognitoIDPAdminPolicy],
        }));
        (_c = listFileLambda.role) === null || _c === void 0 ? void 0 : _c.attachInlinePolicy(new iam.Policy(this, "assume-role-list-policy", {
            statements: [assumeRoleCognitoPolicy],
        }));
        (_d = listFileLambda.role) === null || _d === void 0 ? void 0 : _d.attachInlinePolicy(new iam.Policy(this, "cognito-user-group-list-policy", {
            statements: [cognitoIDPAdminPolicy],
        }));
        // Create REST API Gateway
        const api = new apigateway.RestApi(this, "data-hub-api", {
            defaultCorsPreflightOptions: {
                allowOrigins: [allowOriginURL],
                allowMethods: ["OPTIONS,GET,POST"],
                allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
                allowCredentials: true,
            },
        });
        api.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
        const listdocs = api.root.addResource("list-docs");
        const signedURL = api.root.addResource("signedURL");
        const auth = new apigateway.CognitoUserPoolsAuthorizer(this, "blogAuthorizer", {
            cognitoUserPools: [userPool],
        });
        listdocs.addMethod("GET", new apigateway.LambdaIntegration(listFileLambda), {
            authorizer: auth,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        signedURL.addMethod("POST", new apigateway.LambdaIntegration(presignedURLLambda), {
            authorizer: auth,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // add API Gateway endpoint to SSM param store to use it from the react frontend app
        const apiEndpointParam = new ssm.StringParameter(this, "apiEndpointParam", {
            allowedPattern: ".*",
            description: "Endpoint for API Gateway",
            parameterName: "apiGatewayEndpointParam",
            stringValue: `{"apiEndpoint": "${api.url}","presignedResource": "${signedURL.path}","listDocsResource": "${listdocs.path}"}`,
            tier: ssm.ParameterTier.STANDARD,
        });
        amplifyExecRole.attachInlinePolicy(new iam.Policy(this, "apiEndpointParamPolicy", {
            statements: [
                new iam.PolicyStatement({
                    resources: [`${apiEndpointParam.parameterArn}`],
                    actions: [
                        "ssm:GetParameter",
                    ],
                }),
            ],
        }));
        // add S3 cors rule to use it from the react frontend app
        const s3CorsRuleParam = new ssm.StringParameter(this, "s3CorsRuleParam", {
            allowedPattern: ".*",
            description: "S3 bucket CORS rule",
            parameterName: "s3CorsRuleParam",
            stringValue: `{"CORSRules" : [{"AllowedHeaders":["*"],"AllowedMethods":["GET","POST", "PUT"],"AllowedOrigins":["${allowOriginURL}"]}]}`,
            tier: ssm.ParameterTier.STANDARD,
        });
        const s3BucketNameParam = new ssm.StringParameter(this, "s3BucketNameParam", {
            allowedPattern: ".*",
            description: "S3 bucket name",
            parameterName: "s3BucketNameParam",
            stringValue: s3Bucket.bucketName,
            tier: ssm.ParameterTier.STANDARD,
        });
        amplifyExecRole.attachInlinePolicy(new iam.Policy(this, "s3CorsRuleParamPolicy", {
            statements: [
                new iam.PolicyStatement({
                    resources: [s3CorsRuleParam.parameterArn, s3BucketNameParam.parameterArn],
                    actions: [
                        "ssm:GetParameter",
                    ],
                }),
                new iam.PolicyStatement({
                    resources: [s3Bucket.bucketArn],
                    actions: ["s3:PutBucketCORS"],
                }),
            ],
        }));
        // trigger deployment of amplify hosted react app
        // see https://github.com/aws/aws-cdk/issues/19272 when updating the handler
        new triggers.TriggerFunction(cdk.Stack.of(this), "cdkTriggerAmplifyStartJob", {
            environment: {
                amplifyAppId: amplifyApp.appId,
                branchName: mainBranch.branchName,
            },
            code: lambda.Code.fromAsset("lambdas/cdk"),
            runtime: lambda.Runtime.PYTHON_3_8,
            handler: "trigger_amplify_startJob.lambda_handler",
            timeout: cdk.Duration.seconds(30),
            executeOnHandlerChange: false,
            initialPolicy: [
                new iam.PolicyStatement({
                    resources: [mainBranch.arn + "/jobs/*"],
                    actions: ["amplify:StartJob"],
                }),
            ],
        });
        // relevant stack outputs
        new cdk.CfnOutput(this, "amplifyAppURL", {
            value: allowOriginURL,
        });
        new cdk.CfnOutput(this, "documentStoreBucketName", {
            value: s3Bucket.bucketName,
        });
        new cdk.CfnOutput(this, "region", {
            value: cdk.Stack.of(this).region,
        });
        // exports to create demo data via separate cdk stack
        new cdk.CfnOutput(this, "userPoolId", {
            value: userPool.userPoolId,
            exportName: 'userPoolId',
        });
        new cdk.CfnOutput(this, "userPoolArn", {
            value: userPool.userPoolArn,
            exportName: 'userPoolArn',
        });
    }
}
exports.BlogseriesStack = BlogseriesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvZ3Nlcmllcy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJsb2dzZXJpZXMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsbUNBQW1DO0FBQ25DLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQyx5Q0FBeUM7QUFDekMseURBQXlEO0FBQ3pELDREQUE0RDtBQUM1RCx1REFBdUQ7QUFDdkQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUVqRCxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjs7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTdCLE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3RELFlBQVksRUFBRSxnQkFBZ0I7WUFDOUIsaUJBQWlCLEVBQUUsSUFBSTtZQUN2QixhQUFhLEVBQUU7Z0JBQ2IsUUFBUSxFQUFFLElBQUk7YUFDZjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0QsY0FBYyxFQUFFO2dCQUNkLFNBQVMsRUFBRSxDQUFDO2dCQUNaLGdCQUFnQixFQUFFLEtBQUs7Z0JBQ3ZCLGFBQWEsRUFBRSxLQUFLO2dCQUNwQixnQkFBZ0IsRUFBRSxLQUFLO2dCQUN2QixjQUFjLEVBQUUsS0FBSzthQUN0QjtZQUNELGVBQWUsRUFBRSxPQUFPLENBQUMsZUFBZSxDQUFDLElBQUk7WUFDN0MsbUJBQW1CLEVBQUUsS0FBSztZQUMxQixhQUFhLEVBQUUsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1NBQ3pDLENBQUMsQ0FBQztRQUVILG1CQUFtQjtRQUNuQixN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RSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLGNBQWM7U0FDdEIsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNqRCxLQUFLLEVBQUUsUUFBUSxDQUFDLFVBQVU7U0FDM0IsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxRQUFRLEVBQUU7WUFDaEMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE1BQU07U0FDakMsQ0FBQyxDQUFDO1FBRUgscURBQXFEO1FBQ3JELElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsWUFBWSxFQUFFO1lBQ3BDLEtBQUssRUFBRSxRQUFRLENBQUMsVUFBVTtZQUMxQixVQUFVLEVBQUUsWUFBWTtTQUN6QixDQUFDLENBQUM7UUFDSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUNyQyxLQUFLLEVBQUUsUUFBUSxDQUFDLFdBQVc7WUFDM0IsVUFBVSxFQUFFLGFBQWE7U0FDMUIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBdmlCRCwwQ0F1aUJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSBcImNvbnN0cnVjdHNcIjtcbmltcG9ydCAqIGFzIGNkayBmcm9tIFwiYXdzLWNkay1saWJcIjtcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWxhbWJkYVwiO1xuaW1wb3J0ICogYXMgYXBpZ2F0ZXdheSBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWFwaWdhdGV3YXlcIjtcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSBcImF3cy1jZGstbGliL2F3cy1jb2duaXRvXCI7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSBcImF3cy1jZGstbGliL2F3cy1pYW1cIjtcbmltcG9ydCAqIGFzIHMzIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtczNcIjtcbmltcG9ydCAqIGFzIGNvZGVjb21taXQgZnJvbSBcImF3cy1jZGstbGliL2F3cy1jb2RlY29tbWl0XCI7XG5pbXBvcnQgKiBhcyBhbXBsaWZ5X2FscGhhIGZyb20gXCJAYXdzLWNkay9hd3MtYW1wbGlmeS1hbHBoYVwiO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkXCI7XG5pbXBvcnQgKiBhcyBzc20gZnJvbSBcImF3cy1jZGstbGliL2F3cy1zc21cIjtcbmltcG9ydCAqIGFzIHRyaWdnZXJzIGZyb20gXCJhd3MtY2RrLWxpYi90cmlnZ2Vyc1wiO1xuXG5leHBvcnQgY2xhc3MgQmxvZ3Nlcmllc1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBjZGsuU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgY29uc3QgcGF0aCA9IHJlcXVpcmUoXCJwYXRoXCIpO1xuXG4gICAgY29uc3QgdXNlclBvb2wgPSBuZXcgY29nbml0by5Vc2VyUG9vbCh0aGlzLCBcInVzZXJwb29sXCIsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogXCJibG9nLXVzZXItcG9vbFwiLFxuICAgICAgc2VsZlNpZ25VcEVuYWJsZWQ6IHRydWUsXG4gICAgICBzaWduSW5BbGlhc2VzOiB7XG4gICAgICAgIHVzZXJuYW1lOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGF1dG9WZXJpZnk6IHsgLy9UT0RPIG1pZ2h0IG5lZWQgdG8gYmUgcmVtb3ZlZCB3aGVuIGVtYWlsIGlzIG5vdCBzZXRcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgcGFzc3dvcmRQb2xpY3k6IHsgLy8gZGVtbyBwdXJwb3NlIG9ubHkuIGNoYW5nZSB0byBhIG1vcmUgc2VjdXJlIHBvbGljeS5cbiAgICAgICAgbWluTGVuZ3RoOiA4LFxuICAgICAgICByZXF1aXJlTG93ZXJjYXNlOiBmYWxzZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogZmFsc2UsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IGZhbHNlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5OT05FLFxuICAgICAgc2lnbkluQ2FzZVNlbnNpdGl2ZTogZmFsc2UsXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIH0pO1xuXG4gICAgLy8gVXNlciBQb29sIENsaWVudFxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQoXG4gICAgICB0aGlzLFxuICAgICAgXCJibG9nLXVzZXJwb29sLWNsaWVudFwiLFxuICAgICAge1xuICAgICAgICB1c2VyUG9vbCxcbiAgICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgXSxcbiAgICAgIH1cbiAgICApO1xuICAgIHVzZXJQb29sQ2xpZW50LmFwcGx5UmVtb3ZhbFBvbGljeShjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZKTtcblxuICAgIC8vIGNyZWF0ZSBDb2duaXRvIElkZW50aXR5IFBvb2wgaWRcbiAgICBjb25zdCBpZGVudGl0eVBvb2wgPSBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2woXG4gICAgICB0aGlzLFxuICAgICAgXCJibG9nLWlkZW50aXR5LXBvb2xcIixcbiAgICAgIHtcbiAgICAgICAgaWRlbnRpdHlQb29sTmFtZTogXCJibG9nLWlkZW50aXR5LXBvb2xcIixcbiAgICAgICAgYWxsb3dVbmF1dGhlbnRpY2F0ZWRJZGVudGl0aWVzOiBmYWxzZSxcbiAgICAgICAgY29nbml0b0lkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgY2xpZW50SWQ6IHVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICAgICAgICBwcm92aWRlck5hbWU6IHVzZXJQb29sLnVzZXJQb29sUHJvdmlkZXJOYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9XG4gICAgKTtcbiAgICBpZGVudGl0eVBvb2wuYXBwbHlSZW1vdmFsUG9saWN5KGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1kpO1xuXG4gICAgLy8gZGVmYXVsdCByb2xlIGFuZCBwZXJtaXNzaW9ucyBmb3IgdW5hdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgY29uc3QgY29nbml0b1VuYXV0aGVudGljYXRlZFJvbGUgPSBuZXcgaWFtLlJvbGUoXG4gICAgICB0aGlzLFxuICAgICAgXCJhbm9ueW1vdXMtZ3JvdXAtcm9sZVwiLFxuICAgICAge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJEZWZhdWx0IHJvbGUgZm9yIGFub255bW91cyB1c2Vyc1wiLFxuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiRm9yQW55VmFsdWU6U3RyaW5nTGlrZVwiOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcInVuYXV0aGVudGljYXRlZFwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxuICAgICAgICApLFxuICAgICAgfVxuICAgICk7XG4gICAgY29nbml0b1VuYXV0aGVudGljYXRlZFJvbGUuYWRkVG9Qb2xpY3kobmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIFwibW9iaWxlYW5hbHl0aWNzOlB1dEV2ZW50c1wiLFxuICAgICAgICAgICAgXCJjb2duaXRvLXN5bmM6KlwiXG4gICAgICAgIF0sXG4gICAgICAgIHJlc291cmNlczogW1wiKlwiXSxcbiAgICB9KSk7XG5cbiAgICAvLyBkZWZhdWx0IHJvbGUgYW5kIHBlcm1pc3Npb25zIGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgY29uc3QgY29nbml0b0F1dGhlbnRpY2F0ZWRSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwidXNlcnMtZ3JvdXAtcm9sZVwiLCB7XG4gICAgICBkZXNjcmlwdGlvbjogXCJEZWZhdWx0IHJvbGUgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnNcIixcbiAgICAgIGFzc3VtZWRCeTogbmV3IGlhbS5GZWRlcmF0ZWRQcmluY2lwYWwoXG4gICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgIHtcbiAgICAgICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgXCJGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlXCI6IHtcbiAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcImF1dGhlbnRpY2F0ZWRcIixcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBcInN0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5XCJcbiAgICAgICksXG4gICAgfSk7XG4gICAgY29nbml0b0F1dGhlbnRpY2F0ZWRSb2xlLmFkZFRvUG9saWN5KG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgZWZmZWN0OiBpYW0uRWZmZWN0LkFMTE9XLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICBcIm1vYmlsZWFuYWx5dGljczpQdXRFdmVudHNcIixcbiAgICAgICAgICAgIFwiY29nbml0by1zeW5jOipcIixcbiAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eToqXCJcbiAgICAgICAgXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXCIqXCJdLFxuICAgIH0pKTtcbiAgICAvLyBjaG9vc2UgKHByZWZlcnJlZCkgcm9sZSBmb3IgYXV0aGVudGljYXRlZCB1c2VycyBmcm9tIElEIHRva2VuIFxuICAgIG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KFxuICAgICAgdGhpcyxcbiAgICAgIFwiaWRlbnRpdHktcG9vbC1yb2xlLWF0dGFjaG1lbnRcIixcbiAgICAgIHtcbiAgICAgICAgaWRlbnRpdHlQb29sSWQ6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgIHJvbGVzOiB7XG4gICAgICAgICAgYXV0aGVudGljYXRlZDogY29nbml0b0F1dGhlbnRpY2F0ZWRSb2xlLnJvbGVBcm4sXG4gICAgICAgICAgdW5hdXRoZW50aWNhdGVkOiBjb2duaXRvVW5hdXRoZW50aWNhdGVkUm9sZS5yb2xlQXJuLFxuICAgICAgICB9LFxuICAgICAgICByb2xlTWFwcGluZ3M6IHtcbiAgICAgICAgICBtYXBwaW5nOiB7XG4gICAgICAgICAgICB0eXBlOiBcIlRva2VuXCIsXG4gICAgICAgICAgICBhbWJpZ3VvdXNSb2xlUmVzb2x1dGlvbjogXCJEZW55XCIsXG4gICAgICAgICAgICBpZGVudGl0eVByb3ZpZGVyOiBgY29nbml0by1pZHAuJHtcbiAgICAgICAgICAgICAgY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvblxuICAgICAgICAgICAgfS5hbWF6b25hd3MuY29tLyR7dXNlclBvb2wudXNlclBvb2xJZH06JHtcbiAgICAgICAgICAgICAgdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZFxuICAgICAgICAgICAgfWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy9EZWNsYXJlIHRoZSBVc2VyIFBvb2wgR3JvdXAgSUFNIHJvbGVzXG4gICAgY29uc3QgQWRtaW5Hcm91cElBTXJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJBZG1pblJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkNvbXBvc2l0ZVByaW5jaXBhbChcbiAgICAgICAgbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKGAke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fWApXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgQzFncm91cElBTXJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJDMVJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkNvbXBvc2l0ZVByaW5jaXBhbChcbiAgICAgICAgbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKGAke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fWApXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgQzJncm91cElBTXJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJDMlJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkNvbXBvc2l0ZVByaW5jaXBhbChcbiAgICAgICAgbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKGAke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fWApXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy9EZWNsYXJlIHRoZSBVc2VyIFBvb2wgR3JvdXBzXG4gICAgY29uc3QgY2ZuVXNlclBvb2xHcm91cEFkbWluID0gbmV3IGNvZ25pdG8uQ2ZuVXNlclBvb2xHcm91cCh0aGlzLCBcIkFkbWluXCIsIHtcbiAgICAgIHVzZXJQb29sSWQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogXCJBZG1pbiBncm91cFwiLFxuICAgICAgZ3JvdXBOYW1lOiBcIkFkbWluXCIsXG4gICAgICBwcmVjZWRlbmNlOiAxLFxuICAgICAgcm9sZUFybjogQWRtaW5Hcm91cElBTXJvbGUucm9sZUFybixcbiAgICB9KTtcbiAgICBcbiAgICBjb25zdCBjZm5Vc2VyUG9vbEdyb3VwQzEgPSBuZXcgY29nbml0by5DZm5Vc2VyUG9vbEdyb3VwKHRoaXMsIFwiQzFcIiwge1xuICAgICAgdXNlclBvb2xJZDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkMxIGdyb3VwXCIsXG4gICAgICBncm91cE5hbWU6IFwiQzFcIixcbiAgICAgIHByZWNlZGVuY2U6IDIsXG4gICAgICByb2xlQXJuOiBDMWdyb3VwSUFNcm9sZS5yb2xlQXJuLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY2ZuVXNlclBvb2xHcm91cEMyID0gbmV3IGNvZ25pdG8uQ2ZuVXNlclBvb2xHcm91cCh0aGlzLCBcIkMyXCIsIHtcbiAgICAgIHVzZXJQb29sSWQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogXCJDMiBncm91cFwiLFxuICAgICAgZ3JvdXBOYW1lOiBcIkMyXCIsXG4gICAgICBwcmVjZWRlbmNlOiAzLFxuICAgICAgcm9sZUFybjogQzJncm91cElBTXJvbGUucm9sZUFybixcbiAgICB9KTtcblxuICAgIC8vIGNyZWF0ZSBzMyBidWNrZXQgdG8gdXBsb2FkIGRvY3VtZW50c1xuICAgIGNvbnN0IHMzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCBcInMzLWJ1Y2tldFwiLCB7XG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcbiAgICAgICAgICBdLFxuICAgICAgICAgIC8vdXBkYXRlZCBhcyBwYXJ0IG9mIHRoZSBidWlsZCBhbmQgZGVwbG95IHBpcGVsaW5lIG9mIHRoZSBBbXBsaWZ5IGhvc3RlZCBmcm9udC1lbmQgYXBwbGljYXRpb25cbiAgICAgICAgICBhbGxvd2VkT3JpZ2luczogW1wiKlwiXSwgXG4gICAgICAgICAgYWxsb3dlZEhlYWRlcnM6IFtcIipcIl0sXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gY3JlYXRlIGEgUzMgcHV0IHBvbGljeSBzdGF0ZW1lbnRcbiAgICBjb25zdCBzM1B1dE9iamVjdFBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcInMzOlB1dE9iamVjdFwiLCBcInMzOlB1dE9iamVjdFRhZ2dpbmdcIl0sXG4gICAgICByZXNvdXJjZXM6IFtgJHtzM0J1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICAgIC8vcmVzb3VyY2VzOiBbYCR7czNCdWNrZXQuYnVja2V0QXJufS9gK1wiJHthd3M6UHJpbmNpcGFsVGFnL2dyb3VwbmFtZX0vKlwiXSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHMzTGlzdEJ1Y2tldFBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcInMzOkxpc3RCdWNrZXRcIl0sXG4gICAgICByZXNvdXJjZXM6IFtgJHtzM0J1Y2tldC5idWNrZXRBcm59YF0sXG4gICAgICAvL3Jlc291cmNlczogW2Ake3MzQnVja2V0LmJ1Y2tldEFybn0vYCtcIiR7YXdzOlByaW5jaXBhbFRhZy9ncm91cG5hbWV9XCJdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYXNzdW1lUm9sZUNvZ25pdG9Qb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAvL1RPRE8gLSBGaXggcmVzb3VyY2Ugd2l0aCByb2xlcyB0byBhc3N1bWUgYW5kIGFkZCB0cnVzdCByZWxhdGlvbnNoaXBcbiAgICAgIGFjdGlvbnM6IFtcInN0czpBc3N1bWVSb2xlXCIsIFwic3RzOlRhZ1Nlc3Npb25cIl0sXG4gICAgICBlZmZlY3Q6IGlhbS5FZmZlY3QuQUxMT1csXG4gICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgXCJhcm46YXdzOmlhbTo6XCIgKyBgJHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH1gICsgXCI6cm9sZS8qXCIsXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY29nbml0b0lEUEFkbWluUG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgYWN0aW9uczogW1wiY29nbml0by1pZHA6QWRtaW5MaXN0R3JvdXBzRm9yVXNlclwiXSxcbiAgICAgIHJlc291cmNlczogW2Ake3VzZXJQb29sLnVzZXJQb29sQXJufWBdLFxuICAgIH0pO1xuXG4gICAgQzFncm91cElBTXJvbGUuYWRkVG9Qb2xpY3koczNQdXRPYmplY3RQb2xpY3kpO1xuICAgIEMxZ3JvdXBJQU1yb2xlLmFkZFRvUG9saWN5KHMzTGlzdEJ1Y2tldFBvbGljeSk7XG4gICAgQzJncm91cElBTXJvbGUuYWRkVG9Qb2xpY3koczNQdXRPYmplY3RQb2xpY3kpO1xuICAgIEMyZ3JvdXBJQU1yb2xlLmFkZFRvUG9saWN5KHMzTGlzdEJ1Y2tldFBvbGljeSk7XG4gICAgczNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoQWRtaW5Hcm91cElBTXJvbGUpO1xuXG4gICAgLy8gY3JlYXRpb24gb2YgdGhlIHNvdXJjZSBjb250cm9sIHJlcG9zaXRvcnkgZm9yIHRoZSByZWFjdCBmcm9udGVuZCBhcHAgaG9zdGVkIG9uIEFtcGxpZnlcbiAgICBjb25zdCByZXBvc2l0b3J5ID0gbmV3IGNvZGVjb21taXQuUmVwb3NpdG9yeSh0aGlzLCBcImZyb250ZW5kLWNvZGUtcmVwb1wiLCB7XG4gICAgICByZXBvc2l0b3J5TmFtZTogXCJmcm9udGVuZC1jb2RlXCIsXG4gICAgICBjb2RlOiBjb2RlY29tbWl0LkNvZGUuZnJvbURpcmVjdG9yeShcbiAgICAgICAgcGF0aC5qb2luKF9fZGlybmFtZSwgXCIvLi4vLi4vcmVhY3QtdWkvXCIpLFxuICAgICAgICBcIm1haW5cIlxuICAgICAgKSwgLy8gQnVnOiBicmFuY2hOYW1lIHByb3BlcnR5IGlzIGRpc3JlZ2FyZGVkXG4gICAgICBkZXNjcmlwdGlvbjogXCJjb2RlIHJlcG9zaXRvcnkgZm9yIHJlYWN0IGZyb250ZW5kIGFwcGxpY2F0aW9uXCIsXG4gICAgfSk7XG4gICAgcmVwb3NpdG9yeS5hcHBseVJlbW92YWxQb2xpY3koY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSk7XG5cbiAgICAvLyBDcmVhdGlvbiBvZiBTU00gUGFybSBmb3IgQW1wbGlmeSBBdXRoIGJhY2tlbmQgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGFtcGZsaXlBdXRoUGFyYW0gPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICBcImFtcGZsaXlCYWNrZW5kQXV0aFBhcmFtXCIsXG4gICAgICB7XG4gICAgICAgIGFsbG93ZWRQYXR0ZXJuOiBcIi4qXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkFtcGxpZnkgQXV0aCBCYWNrZW5kIENvbmZpZ3VyYXRpb25cIixcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogXCJhbXBmbGl5QmFja2VuZEF1dGhQYXJhbVwiLFxuICAgICAgICBzdHJpbmdWYWx1ZTogYHtcIkJsb2dzZXJpZXNTdGFja1wiOntcImJ1Y2tldE5hbWVcIjogXCIke1xuICAgICAgICAgIHMzQnVja2V0LmJ1Y2tldE5hbWVcbiAgICAgICAgfVwiLFwidXNlclBvb2xDbGllbnRJZFwiOiBcIiR7XG4gICAgICAgICAgdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZFxuICAgICAgICB9XCIsXCJyZWdpb25cIjogXCIke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259XCIsXCJ1c2VyUG9vbElkXCI6IFwiJHtcbiAgICAgICAgICB1c2VyUG9vbC51c2VyUG9vbElkXG4gICAgICAgIH1cIixcImlkZW50aXR5UG9vbElkXCI6IFwiJHtpZGVudGl0eVBvb2wucmVmfVwifX1gLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQ3JlYXRpb24gb2YgY3VzdG9tIGV4ZWN1dGlvbiByb2xlIGZvciBhbXBsaWZ5IGFwcFxuICAgIGNvbnN0IHB1bGxDb2RlQ29tbWl0UG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICByZXNvdXJjZXM6IFtgJHtyZXBvc2l0b3J5LnJlcG9zaXRvcnlBcm59YF0sXG4gICAgICAgICAgYWN0aW9uczogW1wiY29kZWNvbW1pdDpHaXRQdWxsXCJdLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgY29uc3QgYW1wbGlmeUF1dGhQYXJhbVBvbGljeSA9IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgcmVzb3VyY2VzOiBbYCR7YW1wZmxpeUF1dGhQYXJhbS5wYXJhbWV0ZXJBcm59YF0sXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyc0J5UGF0aFwiLFxuICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyc1wiLFxuICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyXCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYW1wbGlmeUV4ZWNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiYW1wbGlmeUV4ZWN1dGlvblJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJhbXBsaWZ5LmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgXCJDdXN0b20gcm9sZSBmb3IgQW1wbGlmeSBhcHAgd2l0aCByZWFkIGFjY2VzcyB0byBTU00gUGFyYW1ldGVyIFN0b3JlXCIsXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBBbXBsaWZ5QXV0aFBhcmFtUG9saWN5OiBhbXBsaWZ5QXV0aFBhcmFtUG9saWN5LFxuICAgICAgICBQdWxsQ29kZUNvbW1pdFBvbGljeTogcHVsbENvZGVDb21taXRQb2xpY3ksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRpb24gb2YgQW1wbGlmeSBBcHBcbiAgICBjb25zdCBhbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnlfYWxwaGEuQXBwKHRoaXMsIFwiUmVhY3RGcm9udGVuZEFwcFwiLCB7XG4gICAgICBzb3VyY2VDb2RlUHJvdmlkZXI6IG5ldyBhbXBsaWZ5X2FscGhhLkNvZGVDb21taXRTb3VyY2VDb2RlUHJvdmlkZXIoe1xuICAgICAgICByZXBvc2l0b3J5LFxuICAgICAgfSksXG4gICAgICByb2xlOiBhbXBsaWZ5RXhlY1JvbGUsXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdFRvWWFtbCh7XG4gICAgICAgIC8vIEFsdGVybmF0aXZlbHkgYWRkIGEgYGFtcGxpZnkueW1sYCB0byB0aGUgcmVwb1xuICAgICAgICB2ZXJzaW9uOiBcIjEuMFwiLFxuICAgICAgICBmcm9udGVuZDoge1xuICAgICAgICAgIHBoYXNlczoge1xuICAgICAgICAgICAgcHJlQnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICBcIm5wbSBpbnN0YWxsXCIsXG4gICAgICAgICAgICAgICAgXCJhd3Mgc3NtIGdldC1wYXJhbWV0ZXIgLS1uYW1lICdhbXBmbGl5QmFja2VuZEF1dGhQYXJhbScgLS1xdWVyeSAnUGFyYW1ldGVyLlZhbHVlJyAtLW91dHB1dCB0ZXh0ID4gLi9zcmMvYW1wbGlmeV9hdXRoX2NvbmZpZy5qc29uXCIsXG4gICAgICAgICAgICAgICAgXCJhd3Mgc3NtIGdldC1wYXJhbWV0ZXIgLS1uYW1lICdhcGlHYXRld2F5RW5kcG9pbnRQYXJhbScgLS1xdWVyeSAnUGFyYW1ldGVyLlZhbHVlJyAtLW91dHB1dCB0ZXh0ID4gLi9zcmMvY29tcG9uZW50cy9hcGlfZW5kcG9pbnQuanNvblwiLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXCJucG0gcnVuIGJ1aWxkXCJdLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBvc3RCdWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgIFwiQ09SU19SVUxFPSQoIGF3cyBzc20gZ2V0LXBhcmFtZXRlciAtLW5hbWUgJ3MzQ29yc1J1bGVQYXJhbScgLS1xdWVyeSAnUGFyYW1ldGVyLlZhbHVlJyAtLW91dHB1dCB0ZXh0IClcIixcbiAgICAgICAgICAgICAgICBcIkJVQ0tFVF9OQU1FPSQoIGF3cyBzc20gZ2V0LXBhcmFtZXRlciAtLW5hbWUgJ3MzQnVja2V0TmFtZVBhcmFtJyAtLXF1ZXJ5ICdQYXJhbWV0ZXIuVmFsdWUnIC0tb3V0cHV0IHRleHQgKVwiLCBcbiAgICAgICAgICAgICAgICAnYXdzIHMzYXBpIHB1dC1idWNrZXQtY29ycyAtLWJ1Y2tldCBcIiRCVUNLRVRfTkFNRVwiIC0tY29ycy1jb25maWd1cmF0aW9uIFwiJENPUlNfUlVMRVwiJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhcnRpZmFjdHM6IHtcbiAgICAgICAgICAgIGJhc2VEaXJlY3Rvcnk6IFwiYnVpbGRcIixcbiAgICAgICAgICAgIGZpbGVzOiBbXCIqKi8qXCJdLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2FjaGU6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXCJub2RlX21vZHVsZXMvKiovKlwiXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgYW1wbGlmeUFwcC5hcHBseVJlbW92YWxQb2xpY3koY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSk7XG5cbiAgICAvLyBjb25uZWN0IHRvIG1haW4gYnJhbmNoIG9mIHRoZSBjb2RlIHJlcG9cbiAgICBjb25zdCBtYWluQnJhbmNoID0gYW1wbGlmeUFwcC5hZGRCcmFuY2goXCJtYWluXCIsIHtcbiAgICAgIGF1dG9CdWlsZDogdHJ1ZSxcbiAgICAgIGJyYW5jaE5hbWU6IFwibWFpblwiLFxuICAgIH0pO1xuICAgIC8vIFVSTCB1c2VkIGZvciBDT1JTIG9yaWdpblxuICAgIGNvbnN0IGFsbG93T3JpZ2luVVJMID1cbiAgICAgIFwiaHR0cHM6Ly9cIiArIG1haW5CcmFuY2guYnJhbmNoTmFtZSArIFwiLlwiICsgYW1wbGlmeUFwcC5kZWZhdWx0RG9tYWluO1xuXG4gICAgLy8gQ3JlYXRlIExhbWJkYSBmdW5jdGlvbnMgKGJ1c2luZXNzIGxvZ2ljKVxuICAgIGNvbnN0IGxpc3RGaWxlTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIkxpc3RGaWxlTGFtYmRhXCIsIHtcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIHVwbG9hZEJ1Y2tldE5hbWU6IHMzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIGFsbG93T3JpZ2luczogYWxsb3dPcmlnaW5VUkwsXG4gICAgICAgIHJlZ2lvbjogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIH0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFzXCIpLFxuICAgICAgaGFuZGxlcjogXCJsaXN0X2ZpbGUubGFtYmRhX2hhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzgsXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcmVzaWduZWRVUkxMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiUHJlc2lnbmVkVVJMXCIsIHtcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIHVwbG9hZEJ1Y2tldE5hbWU6IHMzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIGFsbG93T3JpZ2luczogYWxsb3dPcmlnaW5VUkwsXG4gICAgICAgIHJlZ2lvbjogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICAgIH0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQoXCJsYW1iZGFzXCIpLFxuICAgICAgaGFuZGxlcjogXCJwcmVzaWduZWRVUkwubGFtYmRhX2hhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLlBZVEhPTl8zXzgsXG4gICAgfSk7XG5cbiAgICBwcmVzaWduZWRVUkxMYW1iZGEucm9sZT8uYXR0YWNoSW5saW5lUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgXCJhc3N1bWUtcm9sZS1wcmVzaWduZWQtcG9saWN5XCIsIHtcbiAgICAgICAgc3RhdGVtZW50czogW2Fzc3VtZVJvbGVDb2duaXRvUG9saWN5XSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHByZXNpZ25lZFVSTExhbWJkYS5yb2xlPy5hdHRhY2hJbmxpbmVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeSh0aGlzLCBcImNvZ25pdG8tdXNlci1ncm91cC1wb2xpY3lcIiwge1xuICAgICAgICBzdGF0ZW1lbnRzOiBbY29nbml0b0lEUEFkbWluUG9saWN5XSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGxpc3RGaWxlTGFtYmRhLnJvbGU/LmF0dGFjaElubGluZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5KHRoaXMsIFwiYXNzdW1lLXJvbGUtbGlzdC1wb2xpY3lcIiwge1xuICAgICAgICBzdGF0ZW1lbnRzOiBbYXNzdW1lUm9sZUNvZ25pdG9Qb2xpY3ldLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgbGlzdEZpbGVMYW1iZGEucm9sZT8uYXR0YWNoSW5saW5lUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgXCJjb2duaXRvLXVzZXItZ3JvdXAtbGlzdC1wb2xpY3lcIiwge1xuICAgICAgICBzdGF0ZW1lbnRzOiBbY29nbml0b0lEUEFkbWluUG9saWN5XSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIC8vIENyZWF0ZSBSRVNUIEFQSSBHYXRld2F5XG4gICAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCBcImRhdGEtaHViLWFwaVwiLCB7XG4gICAgICBkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dPcmlnaW5zOiBbYWxsb3dPcmlnaW5VUkxdLFxuICAgICAgICBhbGxvd01ldGhvZHM6IFtcIk9QVElPTlMsR0VULFBPU1RcIl0sXG4gICAgICAgIGFsbG93SGVhZGVyczogYXBpZ2F0ZXdheS5Db3JzLkRFRkFVTFRfSEVBREVSUyxcbiAgICAgICAgYWxsb3dDcmVkZW50aWFsczogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgYXBpLmFwcGx5UmVtb3ZhbFBvbGljeShjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZKTtcblxuICAgIGNvbnN0IGxpc3Rkb2NzID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJsaXN0LWRvY3NcIik7XG4gICAgY29uc3Qgc2lnbmVkVVJMID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoXCJzaWduZWRVUkxcIik7XG5cbiAgICBjb25zdCBhdXRoID0gbmV3IGFwaWdhdGV3YXkuQ29nbml0b1VzZXJQb29sc0F1dGhvcml6ZXIoXG4gICAgICB0aGlzLFxuICAgICAgXCJibG9nQXV0aG9yaXplclwiLFxuICAgICAge1xuICAgICAgICBjb2duaXRvVXNlclBvb2xzOiBbdXNlclBvb2xdLFxuICAgICAgfVxuICAgICk7XG5cbiAgICBsaXN0ZG9jcy5hZGRNZXRob2QoXG4gICAgICBcIkdFVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24obGlzdEZpbGVMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyOiBhdXRoLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfVxuICAgICk7XG5cbiAgICBzaWduZWRVUkwuYWRkTWV0aG9kKFxuICAgICAgXCJQT1NUXCIsXG4gICAgICBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbihwcmVzaWduZWRVUkxMYW1iZGEpLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyOiBhdXRoLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvLyBhZGQgQVBJIEdhdGV3YXkgZW5kcG9pbnQgdG8gU1NNIHBhcmFtIHN0b3JlIHRvIHVzZSBpdCBmcm9tIHRoZSByZWFjdCBmcm9udGVuZCBhcHBcbiAgICBjb25zdCBhcGlFbmRwb2ludFBhcmFtID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgXCJhcGlFbmRwb2ludFBhcmFtXCIsIHtcbiAgICAgIGFsbG93ZWRQYXR0ZXJuOiBcIi4qXCIsXG4gICAgICBkZXNjcmlwdGlvbjogXCJFbmRwb2ludCBmb3IgQVBJIEdhdGV3YXlcIixcbiAgICAgIHBhcmFtZXRlck5hbWU6IFwiYXBpR2F0ZXdheUVuZHBvaW50UGFyYW1cIixcbiAgICAgIHN0cmluZ1ZhbHVlOiBge1wiYXBpRW5kcG9pbnRcIjogXCIke2FwaS51cmx9XCIsXCJwcmVzaWduZWRSZXNvdXJjZVwiOiBcIiR7c2lnbmVkVVJMLnBhdGh9XCIsXCJsaXN0RG9jc1Jlc291cmNlXCI6IFwiJHtsaXN0ZG9jcy5wYXRofVwifWAsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcblxuICAgIGFtcGxpZnlFeGVjUm9sZS5hdHRhY2hJbmxpbmVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeSh0aGlzLCBcImFwaUVuZHBvaW50UGFyYW1Qb2xpY3lcIiwge1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgcmVzb3VyY2VzOiBbYCR7YXBpRW5kcG9pbnRQYXJhbS5wYXJhbWV0ZXJBcm59YF0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAgICAgIFwic3NtOkdldFBhcmFtZXRlclwiLFxuICAgICAgICAgICAgXSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgXSxcbiAgICAgIH0pXG4gICAgKTtcbiAgICBcbiAgICAvLyBhZGQgUzMgY29ycyBydWxlIHRvIHVzZSBpdCBmcm9tIHRoZSByZWFjdCBmcm9udGVuZCBhcHBcbiAgICBjb25zdCBzM0NvcnNSdWxlUGFyYW0gPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcih0aGlzLCBcInMzQ29yc1J1bGVQYXJhbVwiLCB7XG4gICAgICBhbGxvd2VkUGF0dGVybjogXCIuKlwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiUzMgYnVja2V0IENPUlMgcnVsZVwiLFxuICAgICAgcGFyYW1ldGVyTmFtZTogXCJzM0NvcnNSdWxlUGFyYW1cIixcbiAgICAgIHN0cmluZ1ZhbHVlOiBge1wiQ09SU1J1bGVzXCIgOiBbe1wiQWxsb3dlZEhlYWRlcnNcIjpbXCIqXCJdLFwiQWxsb3dlZE1ldGhvZHNcIjpbXCJHRVRcIixcIlBPU1RcIiwgXCJQVVRcIl0sXCJBbGxvd2VkT3JpZ2luc1wiOltcIiR7YWxsb3dPcmlnaW5VUkx9XCJdfV19YCxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuICAgIGNvbnN0IHMzQnVja2V0TmFtZVBhcmFtID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgXCJzM0J1Y2tldE5hbWVQYXJhbVwiLCB7XG4gICAgICBhbGxvd2VkUGF0dGVybjogXCIuKlwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiUzMgYnVja2V0IG5hbWVcIixcbiAgICAgIHBhcmFtZXRlck5hbWU6IFwiczNCdWNrZXROYW1lUGFyYW1cIixcbiAgICAgIHN0cmluZ1ZhbHVlOiBzM0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBhbXBsaWZ5RXhlY1JvbGUuYXR0YWNoSW5saW5lUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgXCJzM0NvcnNSdWxlUGFyYW1Qb2xpY3lcIiwge1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgcmVzb3VyY2VzOiBbczNDb3JzUnVsZVBhcmFtLnBhcmFtZXRlckFybixzM0J1Y2tldE5hbWVQYXJhbS5wYXJhbWV0ZXJBcm5dLFxuICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICBcInNzbTpHZXRQYXJhbWV0ZXJcIixcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSksXG4gICAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgICAgcmVzb3VyY2VzOiBbczNCdWNrZXQuYnVja2V0QXJuXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcInMzOlB1dEJ1Y2tldENPUlNcIl0sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyB0cmlnZ2VyIGRlcGxveW1lbnQgb2YgYW1wbGlmeSBob3N0ZWQgcmVhY3QgYXBwXG4gICAgLy8gc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hd3MvYXdzLWNkay9pc3N1ZXMvMTkyNzIgd2hlbiB1cGRhdGluZyB0aGUgaGFuZGxlclxuICAgIG5ldyB0cmlnZ2Vycy5UcmlnZ2VyRnVuY3Rpb24oY2RrLlN0YWNrLm9mKHRoaXMpLCBcImNka1RyaWdnZXJBbXBsaWZ5U3RhcnRKb2JcIiwge1xuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYW1wbGlmeUFwcElkOiBhbXBsaWZ5QXBwLmFwcElkLFxuICAgICAgICBicmFuY2hOYW1lOiBtYWluQnJhbmNoLmJyYW5jaE5hbWUsXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhcy9jZGtcIiksXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM184LFxuICAgICAgaGFuZGxlcjogXCJ0cmlnZ2VyX2FtcGxpZnlfc3RhcnRKb2IubGFtYmRhX2hhbmRsZXJcIixcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIGV4ZWN1dGVPbkhhbmRsZXJDaGFuZ2U6IGZhbHNlLFxuICAgICAgaW5pdGlhbFBvbGljeTogW1xuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgcmVzb3VyY2VzOiBbbWFpbkJyYW5jaC5hcm4gKyBcIi9qb2JzLypcIl0sXG4gICAgICAgICAgYWN0aW9uczogW1wiYW1wbGlmeTpTdGFydEpvYlwiXSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG5cbiAgICAvLyByZWxldmFudCBzdGFjayBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJhbXBsaWZ5QXBwVVJMXCIsIHtcbiAgICAgIHZhbHVlOiBhbGxvd09yaWdpblVSTCxcbiAgICB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImRvY3VtZW50U3RvcmVCdWNrZXROYW1lXCIsIHtcbiAgICAgIHZhbHVlOiBzM0J1Y2tldC5idWNrZXROYW1lLFxuICAgIH0pO1xuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwicmVnaW9uXCIsIHtcbiAgICAgIHZhbHVlOiBjZGsuU3RhY2sub2YodGhpcykucmVnaW9uLFxuICAgIH0pO1xuXG4gICAgLy8gZXhwb3J0cyB0byBjcmVhdGUgZGVtbyBkYXRhIHZpYSBzZXBhcmF0ZSBjZGsgc3RhY2tcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcInVzZXJQb29sSWRcIiwge1xuICAgICAgdmFsdWU6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBleHBvcnROYW1lOiAndXNlclBvb2xJZCcsXG4gICAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJ1c2VyUG9vbEFyblwiLCB7XG4gICAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xBcm4sXG4gICAgICBleHBvcnROYW1lOiAndXNlclBvb2xBcm4nLFxuICAgIH0pO1xuICB9XG59XG4iXX0=