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
            selfSignUpEnabled: false,
            signInAliases: {
                email: true,
            },
            autoVerify: {
                email: true,
            },
            standardAttributes: {
                givenName: {
                    required: true,
                    mutable: true,
                },
                familyName: {
                    required: true,
                    mutable: true,
                },
            },
            customAttributes: {
                group: new cognito.StringAttribute({ mutable: true }),
                isAdmin: new cognito.StringAttribute({ mutable: true }),
            },
            passwordPolicy: {
                minLength: 6,
                requireLowercase: true,
                requireDigits: true,
                requireUppercase: false,
                requireSymbols: false,
            },
            accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });
        // User Pool Client attributes
        const standardCognitoAttributes = {
            givenName: true,
            familyName: true,
            email: true,
            emailVerified: true,
            address: true,
            birthdate: true,
            gender: true,
            locale: true,
            middleName: true,
            fullname: true,
            nickname: true,
            phoneNumber: true,
            phoneNumberVerified: true,
            profilePicture: true,
            preferredUsername: true,
            profilePage: true,
            timezone: true,
            lastUpdateTime: true,
            website: true,
        };
        const clientReadAttributes = new cognito.ClientAttributes()
            .withStandardAttributes(standardCognitoAttributes)
            .withCustomAttributes(...["group", "isAdmin"]);
        const clientWriteAttributes = new cognito.ClientAttributes()
            .withStandardAttributes({
            ...standardCognitoAttributes,
            emailVerified: false,
            phoneNumberVerified: false,
        })
            .withCustomAttributes(...["group"]);
        // //  User Pool Client
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
            readAttributes: clientReadAttributes,
            writeAttributes: clientWriteAttributes,
        });
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
        // create User
        const isAnonymousCognitoGroupRole = new iam.Role(this, "anonymous-group-role", {
            description: "Default role for anonymous users",
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "unauthenticated",
                },
            }, "sts:AssumeRoleWithWebIdentity"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
        });
        const isUserCognitoGroupRole = new iam.Role(this, "users-group-role", {
            description: "Default role for authenticated users",
            assumedBy: new iam.FederatedPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
                "ForAnyValue:StringLike": {
                    "cognito-identity.amazonaws.com:amr": "authenticated",
                },
            }, "sts:AssumeRoleWithWebIdentity"),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"),
            ],
        });
        new cognito.CfnIdentityPoolRoleAttachment(this, "identity-pool-role-attachment", {
            identityPoolId: identityPool.ref,
            roles: {
                authenticated: isUserCognitoGroupRole.roleArn,
                unauthenticated: isAnonymousCognitoGroupRole.roleArn,
            },
            roleMappings: {
                mapping: {
                    type: "Token",
                    ambiguousRoleResolution: "Deny",
                    identityProvider: `cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}:${userPoolClient.userPoolClientId}`,
                },
            },
        });
        // create s3 bucket to upload documents
        const s3Bucket = new s3.Bucket(this, "s3-bucket", {
            bucketName: "blog-bucket-nagelpat",
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
                    allowedOrigins: ["*"],
                    allowedHeaders: ["*"],
                },
            ],
        });
        //Declare the User Pool Group IAM role
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
        const AdminGroupIAMrole = new iam.Role(this, "AdminRole", {
            assumedBy: new iam.CompositePrincipal(new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
                StringEquals: {
                    "cognito-identity.amazonaws.com:aud": identityPool.ref,
                },
            }), new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`)),
        });
        //Declare the User Pool Groups
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
        const cfnUserPoolGroupAdmin = new cognito.CfnUserPoolGroup(this, "Admin", {
            userPoolId: userPool.userPoolId,
            description: "Admin group",
            groupName: "Admin",
            precedence: 1,
            roleArn: AdminGroupIAMrole.roleArn,
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
            //FIX resource with roles to assume and add trust relationship
            actions: ["sts:AssumeRole"],
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
        // Creation of the source control repository
        // const repository = new codecommit.Repository(this, "CodeRepoFrontend", {
        //   repositoryName: "react-frontend-3",
        //   description: "code repo for OpenSearch free text and semantic search",
        // });
        // creation of the source control repository for the react frontend app hosted on Amplify
        const repository = new codecommit.Repository(this, "frontend-code-repo", {
            repositoryName: "frontend-code",
            code: codecommit.Code.fromDirectory(path.join(__dirname, "/../../../../react-frontend-3/"), "main"),
            description: "code repository for react frontend application",
        });
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
        api.root.addMethod("ANY"); //todo check
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
        // trigger to set S3 bucket CORS rule
        // see https://github.com/aws/aws-cdk/issues/19272 when updating the handler
        // const corsTrigger = new triggers.TriggerFunction(cdk.Stack.of(this), "cdkTriggerS3CORSRuleSet", {
        //   environment: {
        //     corsRule: `{"CORSRules" : [{"AllowedHeaders":["*"],"AllowedMethods":["GET","POST", "PUT"],"AllowedOrigins":["${allowOriginURL}"]}]}`,
        //     regionName: cdk.Stack.of(this).region,
        //     bucketName: s3Bucket.bucketName,
        //   },
        //   code: lambda.Code.fromAsset("lambdas/cdk"),
        //   runtime: lambda.Runtime.PYTHON_3_8,
        //   handler: "trigger_s3_corsRule.lambda_handler",
        //   timeout: cdk.Duration.seconds(30),
        //   executeOnHandlerChange: false,
        //   initialPolicy: [
        //     new iam.PolicyStatement({
        //       resources: [s3Bucket.bucketArn],
        //       actions: ["s3:PutBucketCORS"],
        //     }),
        //   ],
        // });
        //testing onlz - separating lambda function from the trigger
        // const corsLambda = new lambda.Function(this, "corsLambda", {
        //   environment: {
        //     corsRule: `{"CORSRules" : [{"AllowedHeaders":["*"],"AllowedMethods":["GET","POST", "PUT"],"AllowedOrigins":["${allowOriginURL}"]}]}`,
        //     regionName: cdk.Stack.of(this).region,
        //     bucketName: s3Bucket.bucketName,
        //   },
        //   code: lambda.Code.fromAsset("lambdas/cdk"),
        //   runtime: lambda.Runtime.PYTHON_3_8,
        //   handler: "trigger_s3_corsRule.lambda_handler",
        //   timeout: cdk.Duration.seconds(30),
        //   initialPolicy: [
        //     new iam.PolicyStatement({
        //       resources: [s3Bucket.bucketArn],
        //       actions: ["s3:PutBucketCORS"],
        //     }),
        //   ],
        // });
        // corsLambda.grantInvoke(new iam.ServicePrincipal("lambda.amazonaws.com"));
        // corsLambda.currentVersion.grantInvoke(new iam.ServicePrincipal("lambda.amazonaws.com"));
        // const corsTrigger = new triggers.Trigger(cdk.Stack.of(this), "cdkTriggerS3CORSRuleSet", {
        //   handler: corsLambda,
        //   executeOnHandlerChange: false,
        // });
        // corsTrigger.node.addDependency(corsLambda);
        // relevant stack outputs
        new cdk.CfnOutput(this, "APIGatewayEndpoint", {
            value: api.url,
        });
        new cdk.CfnOutput(this, "documentStoreBucketName", {
            value: s3Bucket.bucketName,
        });
        new cdk.CfnOutput(this, "region", {
            value: cdk.Stack.of(this).region,
        });
        // new cdk.CfnOutput(this, "corsRule", {
        //   value: `{"CORSRules" : [{"AllowedHeaders":["*"],"AllowedMethods":["GET","POST", "PUT"],"AllowedOrigins":["${allowOriginURL}"]}]}`,
        // });
        new cdk.CfnOutput(this, "amplifyAppURL", {
            value: allowOriginURL,
        });
        // new cdk.CfnOutput(this, "amplifyAuthConfig", {
        //   value: `{"BlogseriesStack":{"bucketName": "${
        //     s3Bucket.bucketName
        //   }","userPoolClientId": "${userPoolClient.userPoolClientId}","region": "${
        //     cdk.Stack.of(this).region
        //   }","userPoolId": "${userPool.userPoolId}","identityPoolId": "${
        //     identityPool.ref
        //   }"}}`,
        // });
    }
}
exports.BlogseriesStack = BlogseriesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvZ3Nlcmllcy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJsb2dzZXJpZXMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsbUNBQW1DO0FBQ25DLGlEQUFpRDtBQUNqRCx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQyx5Q0FBeUM7QUFDekMseURBQXlEO0FBQ3pELDREQUE0RDtBQUM1RCx1REFBdUQ7QUFDdkQsMkNBQTJDO0FBQzNDLGlEQUFpRDtBQUVqRCxNQUFhLGVBQWdCLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDNUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFzQjs7UUFDOUQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBRTdCLE1BQU0sUUFBUSxHQUFHLElBQUksT0FBTyxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsVUFBVSxFQUFFO1lBQ3RELFlBQVksRUFBRSxnQkFBZ0I7WUFDOUIsaUJBQWlCLEVBQUUsS0FBSztZQUN4QixhQUFhLEVBQUU7Z0JBQ2IsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELFVBQVUsRUFBRTtnQkFDVixLQUFLLEVBQUUsSUFBSTthQUNaO1lBQ0Qsa0JBQWtCLEVBQUU7Z0JBQ2xCLFNBQVMsRUFBRTtvQkFDVCxRQUFRLEVBQUUsSUFBSTtvQkFDZCxPQUFPLEVBQUUsSUFBSTtpQkFDZDtnQkFDRCxVQUFVLEVBQUU7b0JBQ1YsUUFBUSxFQUFFLElBQUk7b0JBQ2QsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7YUFDRjtZQUNELGdCQUFnQixFQUFFO2dCQUNoQixLQUFLLEVBQUUsSUFBSSxPQUFPLENBQUMsZUFBZSxDQUFDLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxDQUFDO2dCQUNyRCxPQUFPLEVBQUUsSUFBSSxPQUFPLENBQUMs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XG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcImF3cy1jZGstbGliXCI7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSBcImF3cy1jZGstbGliL2F3cy1sYW1iZGFcIjtcbmltcG9ydCAqIGFzIGFwaWdhdGV3YXkgZnJvbSBcImF3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5XCI7XG5pbXBvcnQgKiBhcyBjb2duaXRvIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29nbml0b1wiO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtaWFtXCI7XG5pbXBvcnQgKiBhcyBzMyBmcm9tIFwiYXdzLWNkay1saWIvYXdzLXMzXCI7XG5pbXBvcnQgKiBhcyBjb2RlY29tbWl0IGZyb20gXCJhd3MtY2RrLWxpYi9hd3MtY29kZWNvbW1pdFwiO1xuaW1wb3J0ICogYXMgYW1wbGlmeV9hbHBoYSBmcm9tIFwiQGF3cy1jZGsvYXdzLWFtcGxpZnktYWxwaGFcIjtcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tIFwiYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZFwiO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gXCJhd3MtY2RrLWxpYi9hd3Mtc3NtXCI7XG5pbXBvcnQgKiBhcyB0cmlnZ2VycyBmcm9tIFwiYXdzLWNkay1saWIvdHJpZ2dlcnNcIjtcblxuZXhwb3J0IGNsYXNzIEJsb2dzZXJpZXNTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzPzogY2RrLlN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIGNvbnN0IHBhdGggPSByZXF1aXJlKFwicGF0aFwiKTtcblxuICAgIGNvbnN0IHVzZXJQb29sID0gbmV3IGNvZ25pdG8uVXNlclBvb2wodGhpcywgXCJ1c2VycG9vbFwiLCB7XG4gICAgICB1c2VyUG9vbE5hbWU6IFwiYmxvZy11c2VyLXBvb2xcIixcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiBmYWxzZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZ2l2ZW5OYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZmFtaWx5TmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICBncm91cDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgICAgaXNBZG1pbjogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHsgbXV0YWJsZTogdHJ1ZSB9KSxcbiAgICAgIH0sXG4gICAgICBwYXNzd29yZFBvbGljeToge1xuICAgICAgICBtaW5MZW5ndGg6IDYsXG4gICAgICAgIHJlcXVpcmVMb3dlcmNhc2U6IHRydWUsXG4gICAgICAgIHJlcXVpcmVEaWdpdHM6IHRydWUsXG4gICAgICAgIHJlcXVpcmVVcHBlcmNhc2U6IGZhbHNlLFxuICAgICAgICByZXF1aXJlU3ltYm9sczogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYWNjb3VudFJlY292ZXJ5OiBjb2duaXRvLkFjY291bnRSZWNvdmVyeS5FTUFJTF9PTkxZLFxuICAgICAgcmVtb3ZhbFBvbGljeTogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICB9KTtcblxuICAgIC8vIFVzZXIgUG9vbCBDbGllbnQgYXR0cmlidXRlc1xuICAgIGNvbnN0IHN0YW5kYXJkQ29nbml0b0F0dHJpYnV0ZXMgPSB7XG4gICAgICBnaXZlbk5hbWU6IHRydWUsXG4gICAgICBmYW1pbHlOYW1lOiB0cnVlLFxuICAgICAgZW1haWw6IHRydWUsXG4gICAgICBlbWFpbFZlcmlmaWVkOiB0cnVlLFxuICAgICAgYWRkcmVzczogdHJ1ZSxcbiAgICAgIGJpcnRoZGF0ZTogdHJ1ZSxcbiAgICAgIGdlbmRlcjogdHJ1ZSxcbiAgICAgIGxvY2FsZTogdHJ1ZSxcbiAgICAgIG1pZGRsZU5hbWU6IHRydWUsXG4gICAgICBmdWxsbmFtZTogdHJ1ZSxcbiAgICAgIG5pY2tuYW1lOiB0cnVlLFxuICAgICAgcGhvbmVOdW1iZXI6IHRydWUsXG4gICAgICBwaG9uZU51bWJlclZlcmlmaWVkOiB0cnVlLFxuICAgICAgcHJvZmlsZVBpY3R1cmU6IHRydWUsXG4gICAgICBwcmVmZXJyZWRVc2VybmFtZTogdHJ1ZSxcbiAgICAgIHByb2ZpbGVQYWdlOiB0cnVlLFxuICAgICAgdGltZXpvbmU6IHRydWUsXG4gICAgICBsYXN0VXBkYXRlVGltZTogdHJ1ZSxcbiAgICAgIHdlYnNpdGU6IHRydWUsXG4gICAgfTtcblxuICAgIGNvbnN0IGNsaWVudFJlYWRBdHRyaWJ1dGVzID0gbmV3IGNvZ25pdG8uQ2xpZW50QXR0cmlidXRlcygpXG4gICAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyhzdGFuZGFyZENvZ25pdG9BdHRyaWJ1dGVzKVxuICAgICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKC4uLltcImdyb3VwXCIsIFwiaXNBZG1pblwiXSk7XG5cbiAgICBjb25zdCBjbGllbnRXcml0ZUF0dHJpYnV0ZXMgPSBuZXcgY29nbml0by5DbGllbnRBdHRyaWJ1dGVzKClcbiAgICAgIC53aXRoU3RhbmRhcmRBdHRyaWJ1dGVzKHtcbiAgICAgICAgLi4uc3RhbmRhcmRDb2duaXRvQXR0cmlidXRlcyxcbiAgICAgICAgZW1haWxWZXJpZmllZDogZmFsc2UsXG4gICAgICAgIHBob25lTnVtYmVyVmVyaWZpZWQ6IGZhbHNlLFxuICAgICAgfSlcbiAgICAgIC53aXRoQ3VzdG9tQXR0cmlidXRlcyguLi5bXCJncm91cFwiXSk7XG5cbiAgICAvLyAvLyAgVXNlciBQb29sIENsaWVudFxuICAgIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQoXG4gICAgICB0aGlzLFxuICAgICAgXCJibG9nLXVzZXJwb29sLWNsaWVudFwiLFxuICAgICAge1xuICAgICAgICB1c2VyUG9vbCxcbiAgICAgICAgYXV0aEZsb3dzOiB7XG4gICAgICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICAgICAgY3VzdG9tOiB0cnVlLFxuICAgICAgICAgIHVzZXJTcnA6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICAgIHN1cHBvcnRlZElkZW50aXR5UHJvdmlkZXJzOiBbXG4gICAgICAgICAgY29nbml0by5Vc2VyUG9vbENsaWVudElkZW50aXR5UHJvdmlkZXIuQ09HTklUTyxcbiAgICAgICAgXSxcbiAgICAgICAgcmVhZEF0dHJpYnV0ZXM6IGNsaWVudFJlYWRBdHRyaWJ1dGVzLFxuICAgICAgICB3cml0ZUF0dHJpYnV0ZXM6IGNsaWVudFdyaXRlQXR0cmlidXRlcyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gY3JlYXRlIENvZ25pdG8gSWRlbnRpdHkgUG9vbCBpZFxuICAgIGNvbnN0IGlkZW50aXR5UG9vbCA9IG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbChcbiAgICAgIHRoaXMsXG4gICAgICBcImJsb2ctaWRlbnRpdHktcG9vbFwiLFxuICAgICAge1xuICAgICAgICBpZGVudGl0eVBvb2xOYW1lOiBcImJsb2ctaWRlbnRpdHktcG9vbFwiLFxuICAgICAgICBhbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IGZhbHNlLFxuICAgICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjbGllbnRJZDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICAgIHByb3ZpZGVyTmFtZTogdXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gY3JlYXRlIFVzZXJcbiAgICBjb25zdCBpc0Fub255bW91c0NvZ25pdG9Hcm91cFJvbGUgPSBuZXcgaWFtLlJvbGUoXG4gICAgICB0aGlzLFxuICAgICAgXCJhbm9ueW1vdXMtZ3JvdXAtcm9sZVwiLFxuICAgICAge1xuICAgICAgICBkZXNjcmlwdGlvbjogXCJEZWZhdWx0IHJvbGUgZm9yIGFub255bW91cyB1c2Vyc1wiLFxuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tXCIsXG4gICAgICAgICAge1xuICAgICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZFwiOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIFwiRm9yQW55VmFsdWU6U3RyaW5nTGlrZVwiOiB7XG4gICAgICAgICAgICAgIFwiY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtclwiOiBcInVuYXV0aGVudGljYXRlZFwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxuICAgICAgICApLFxuICAgICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgICBcInNlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGVcIlxuICAgICAgICAgICksXG4gICAgICAgIF0sXG4gICAgICB9XG4gICAgKTtcblxuICAgIGNvbnN0IGlzVXNlckNvZ25pdG9Hcm91cFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJ1c2Vycy1ncm91cC1yb2xlXCIsIHtcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkRlZmF1bHQgcm9sZSBmb3IgYXV0aGVudGljYXRlZCB1c2Vyc1wiLFxuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb21cIixcbiAgICAgICAge1xuICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkXCI6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgICAgfSxcbiAgICAgICAgICBcIkZvckFueVZhbHVlOlN0cmluZ0xpa2VcIjoge1xuICAgICAgICAgICAgXCJjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yXCI6IFwiYXV0aGVudGljYXRlZFwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICAgIFwic3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHlcIlxuICAgICAgKSxcbiAgICAgIG1hbmFnZWRQb2xpY2llczogW1xuICAgICAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAgICAgXCJzZXJ2aWNlLXJvbGUvQVdTTGFtYmRhQmFzaWNFeGVjdXRpb25Sb2xlXCJcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBuZXcgY29nbml0by5DZm5JZGVudGl0eVBvb2xSb2xlQXR0YWNobWVudChcbiAgICAgIHRoaXMsXG4gICAgICBcImlkZW50aXR5LXBvb2wtcm9sZS1hdHRhY2htZW50XCIsXG4gICAgICB7XG4gICAgICAgIGlkZW50aXR5UG9vbElkOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgICByb2xlczoge1xuICAgICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGlzVXNlckNvZ25pdG9Hcm91cFJvbGUucm9sZUFybixcbiAgICAgICAgICB1bmF1dGhlbnRpY2F0ZWQ6IGlzQW5vbnltb3VzQ29nbml0b0dyb3VwUm9sZS5yb2xlQXJuLFxuICAgICAgICB9LFxuICAgICAgICByb2xlTWFwcGluZ3M6IHtcbiAgICAgICAgICBtYXBwaW5nOiB7XG4gICAgICAgICAgICB0eXBlOiBcIlRva2VuXCIsXG4gICAgICAgICAgICBhbWJpZ3VvdXNSb2xlUmVzb2x1dGlvbjogXCJEZW55XCIsXG4gICAgICAgICAgICBpZGVudGl0eVByb3ZpZGVyOiBgY29nbml0by1pZHAuJHtcbiAgICAgICAgICAgICAgY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvblxuICAgICAgICAgICAgfS5hbWF6b25hd3MuY29tLyR7dXNlclBvb2wudXNlclBvb2xJZH06JHtcbiAgICAgICAgICAgICAgdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZFxuICAgICAgICAgICAgfWAsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gY3JlYXRlIHMzIGJ1Y2tldCB0byB1cGxvYWQgZG9jdW1lbnRzXG4gICAgY29uc3QgczNCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsIFwiczMtYnVja2V0XCIsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IFwiYmxvZy1idWNrZXQtbmFnZWxwYXRcIiwgLy9UT0RPIGNoYW5nZSBuYW1lXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHRydWUsXG4gICAgICB2ZXJzaW9uZWQ6IGZhbHNlLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBlbmNyeXB0aW9uOiBzMy5CdWNrZXRFbmNyeXB0aW9uLlMzX01BTkFHRUQsXG4gICAgICBjb3JzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBhbGxvd2VkTWV0aG9kczogW1xuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuR0VULFxuICAgICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICAgIHMzLkh0dHBNZXRob2RzLlBVVCxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXCIqXCJdLCAvL3VwZGF0ZWQgaW4gc2VwYXJhdGUgc3RhY2sgb25jZSB0aGUgcmVzb3VyY2UgaXMgY3JlYXRlZFxuICAgICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbXCIqXCJdLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vRGVjbGFyZSB0aGUgVXNlciBQb29sIEdyb3VwIElBTSByb2xlXG4gICAgY29uc3QgQzFncm91cElBTXJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJDMVJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkNvbXBvc2l0ZVByaW5jaXBhbChcbiAgICAgICAgbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKGAke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fWApXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgQzJncm91cElBTXJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJDMlJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkNvbXBvc2l0ZVByaW5jaXBhbChcbiAgICAgICAgbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKGAke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fWApXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgY29uc3QgQWRtaW5Hcm91cElBTXJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgXCJBZG1pblJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLkNvbXBvc2l0ZVByaW5jaXBhbChcbiAgICAgICAgbmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbChcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbVwiLCB7XG4gICAgICAgICAgU3RyaW5nRXF1YWxzOiB7XG4gICAgICAgICAgICBcImNvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWRcIjogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICAgbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKGAke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fWApXG4gICAgICApLFxuICAgIH0pO1xuXG4gICAgLy9EZWNsYXJlIHRoZSBVc2VyIFBvb2wgR3JvdXBzXG4gICAgY29uc3QgY2ZuVXNlclBvb2xHcm91cEMxID0gbmV3IGNvZ25pdG8uQ2ZuVXNlclBvb2xHcm91cCh0aGlzLCBcIkMxXCIsIHtcbiAgICAgIHVzZXJQb29sSWQ6IHVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogXCJDMSBncm91cFwiLFxuICAgICAgZ3JvdXBOYW1lOiBcIkMxXCIsXG4gICAgICBwcmVjZWRlbmNlOiAyLFxuICAgICAgcm9sZUFybjogQzFncm91cElBTXJvbGUucm9sZUFybixcbiAgICB9KTtcblxuICAgIGNvbnN0IGNmblVzZXJQb29sR3JvdXBDMiA9IG5ldyBjb2duaXRvLkNmblVzZXJQb29sR3JvdXAodGhpcywgXCJDMlwiLCB7XG4gICAgICB1c2VyUG9vbElkOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246IFwiQzIgZ3JvdXBcIixcbiAgICAgIGdyb3VwTmFtZTogXCJDMlwiLFxuICAgICAgcHJlY2VkZW5jZTogMyxcbiAgICAgIHJvbGVBcm46IEMyZ3JvdXBJQU1yb2xlLnJvbGVBcm4sXG4gICAgfSk7XG5cbiAgICBjb25zdCBjZm5Vc2VyUG9vbEdyb3VwQWRtaW4gPSBuZXcgY29nbml0by5DZm5Vc2VyUG9vbEdyb3VwKHRoaXMsIFwiQWRtaW5cIiwge1xuICAgICAgdXNlclBvb2xJZDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiBcIkFkbWluIGdyb3VwXCIsXG4gICAgICBncm91cE5hbWU6IFwiQWRtaW5cIixcbiAgICAgIHByZWNlZGVuY2U6IDEsXG4gICAgICByb2xlQXJuOiBBZG1pbkdyb3VwSUFNcm9sZS5yb2xlQXJuLFxuICAgIH0pO1xuXG4gICAgLy8gY3JlYXRlIGEgUzMgcHV0IHBvbGljeSBzdGF0ZW1lbnRcbiAgICBjb25zdCBzM1B1dE9iamVjdFBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcInMzOlB1dE9iamVjdFwiLCBcInMzOlB1dE9iamVjdFRhZ2dpbmdcIl0sXG4gICAgICByZXNvdXJjZXM6IFtgJHtzM0J1Y2tldC5idWNrZXRBcm59LypgXSxcbiAgICB9KTtcblxuICAgIGNvbnN0IHMzTGlzdEJ1Y2tldFBvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIGFjdGlvbnM6IFtcInMzOkxpc3RCdWNrZXRcIl0sXG4gICAgICByZXNvdXJjZXM6IFtgJHtzM0J1Y2tldC5idWNrZXRBcm59YF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBhc3N1bWVSb2xlQ29nbml0b1BvbGljeSA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgIC8vRklYIHJlc291cmNlIHdpdGggcm9sZXMgdG8gYXNzdW1lIGFuZCBhZGQgdHJ1c3QgcmVsYXRpb25zaGlwXG4gICAgICBhY3Rpb25zOiBbXCJzdHM6QXNzdW1lUm9sZVwiXSxcbiAgICAgIGVmZmVjdDogaWFtLkVmZmVjdC5BTExPVyxcbiAgICAgIHJlc291cmNlczogW1xuICAgICAgICBcImFybjphd3M6aWFtOjpcIiArIGAke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fWAgKyBcIjpyb2xlLypcIixcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICBjb25zdCBjb2duaXRvSURQQWRtaW5Qb2xpY3kgPSBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICBhY3Rpb25zOiBbXCJjb2duaXRvLWlkcDpBZG1pbkxpc3RHcm91cHNGb3JVc2VyXCJdLFxuICAgICAgcmVzb3VyY2VzOiBbYCR7dXNlclBvb2wudXNlclBvb2xBcm59YF0sXG4gICAgfSk7XG5cbiAgICBDMWdyb3VwSUFNcm9sZS5hZGRUb1BvbGljeShzM1B1dE9iamVjdFBvbGljeSk7XG4gICAgQzFncm91cElBTXJvbGUuYWRkVG9Qb2xpY3koczNMaXN0QnVja2V0UG9saWN5KTtcbiAgICBDMmdyb3VwSUFNcm9sZS5hZGRUb1BvbGljeShzM1B1dE9iamVjdFBvbGljeSk7XG4gICAgQzJncm91cElBTXJvbGUuYWRkVG9Qb2xpY3koczNMaXN0QnVja2V0UG9saWN5KTtcbiAgICBzM0J1Y2tldC5ncmFudFJlYWRXcml0ZShBZG1pbkdyb3VwSUFNcm9sZSk7XG5cbiAgICAvLyBDcmVhdGlvbiBvZiB0aGUgc291cmNlIGNvbnRyb2wgcmVwb3NpdG9yeVxuICAgIC8vIGNvbnN0IHJlcG9zaXRvcnkgPSBuZXcgY29kZWNvbW1pdC5SZXBvc2l0b3J5KHRoaXMsIFwiQ29kZVJlcG9Gcm9udGVuZFwiLCB7XG4gICAgLy8gICByZXBvc2l0b3J5TmFtZTogXCJyZWFjdC1mcm9udGVuZC0zXCIsXG4gICAgLy8gICBkZXNjcmlwdGlvbjogXCJjb2RlIHJlcG8gZm9yIE9wZW5TZWFyY2ggZnJlZSB0ZXh0IGFuZCBzZW1hbnRpYyBzZWFyY2hcIixcbiAgICAvLyB9KTtcblxuICAgIC8vIGNyZWF0aW9uIG9mIHRoZSBzb3VyY2UgY29udHJvbCByZXBvc2l0b3J5IGZvciB0aGUgcmVhY3QgZnJvbnRlbmQgYXBwIGhvc3RlZCBvbiBBbXBsaWZ5XG4gICAgY29uc3QgcmVwb3NpdG9yeSA9IG5ldyBjb2RlY29tbWl0LlJlcG9zaXRvcnkodGhpcywgXCJmcm9udGVuZC1jb2RlLXJlcG9cIiwge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6IFwiZnJvbnRlbmQtY29kZVwiLFxuICAgICAgY29kZTogY29kZWNvbW1pdC5Db2RlLmZyb21EaXJlY3RvcnkoXG4gICAgICAgIHBhdGguam9pbihfX2Rpcm5hbWUsIFwiLy4uLy4uLy4uLy4uL3JlYWN0LWZyb250ZW5kLTMvXCIpLFxuICAgICAgICBcIm1haW5cIlxuICAgICAgKSwgLy8gQnVnOiBicmFuY2hOYW1lIHByb3BlcnR5IGlzIGRpc3JlZ2FyZGVkXG4gICAgICBkZXNjcmlwdGlvbjogXCJjb2RlIHJlcG9zaXRvcnkgZm9yIHJlYWN0IGZyb250ZW5kIGFwcGxpY2F0aW9uXCIsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGlvbiBvZiBTU00gUGFybSBmb3IgQW1wbGlmeSBBdXRoIGJhY2tlbmQgY29uZmlndXJhdGlvblxuICAgIGNvbnN0IGFtcGZsaXlBdXRoUGFyYW0gPSBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihcbiAgICAgIHRoaXMsXG4gICAgICBcImFtcGZsaXlCYWNrZW5kQXV0aFBhcmFtXCIsXG4gICAgICB7XG4gICAgICAgIGFsbG93ZWRQYXR0ZXJuOiBcIi4qXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIkFtcGxpZnkgQXV0aCBCYWNrZW5kIENvbmZpZ3VyYXRpb25cIixcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogXCJhbXBmbGl5QmFja2VuZEF1dGhQYXJhbVwiLFxuICAgICAgICBzdHJpbmdWYWx1ZTogYHtcIkJsb2dzZXJpZXNTdGFja1wiOntcImJ1Y2tldE5hbWVcIjogXCIke1xuICAgICAgICAgIHMzQnVja2V0LmJ1Y2tldE5hbWVcbiAgICAgICAgfVwiLFwidXNlclBvb2xDbGllbnRJZFwiOiBcIiR7XG4gICAgICAgICAgdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZFxuICAgICAgICB9XCIsXCJyZWdpb25cIjogXCIke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259XCIsXCJ1c2VyUG9vbElkXCI6IFwiJHtcbiAgICAgICAgICB1c2VyUG9vbC51c2VyUG9vbElkXG4gICAgICAgIH1cIixcImlkZW50aXR5UG9vbElkXCI6IFwiJHtpZGVudGl0eVBvb2wucmVmfVwifX1gLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gQ3JlYXRpb24gb2YgY3VzdG9tIGV4ZWN1dGlvbiByb2xlIGZvciBhbXBsaWZ5IGFwcFxuICAgIGNvbnN0IHB1bGxDb2RlQ29tbWl0UG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lEb2N1bWVudCh7XG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICByZXNvdXJjZXM6IFtgJHtyZXBvc2l0b3J5LnJlcG9zaXRvcnlBcm59YF0sXG4gICAgICAgICAgYWN0aW9uczogW1wiY29kZWNvbW1pdDpHaXRQdWxsXCJdLFxuICAgICAgICB9KSxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgY29uc3QgYW1wbGlmeUF1dGhQYXJhbVBvbGljeSA9IG5ldyBpYW0uUG9saWN5RG9jdW1lbnQoe1xuICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgICAgcmVzb3VyY2VzOiBbYCR7YW1wZmxpeUF1dGhQYXJhbS5wYXJhbWV0ZXJBcm59YF0sXG4gICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyc0J5UGF0aFwiLFxuICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyc1wiLFxuICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyXCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgY29uc3QgYW1wbGlmeUV4ZWNSb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsIFwiYW1wbGlmeUV4ZWN1dGlvblJvbGVcIiwge1xuICAgICAgYXNzdW1lZEJ5OiBuZXcgaWFtLlNlcnZpY2VQcmluY2lwYWwoXCJhbXBsaWZ5LmFtYXpvbmF3cy5jb21cIiksXG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgXCJDdXN0b20gcm9sZSBmb3IgQW1wbGlmeSBhcHAgd2l0aCByZWFkIGFjY2VzcyB0byBTU00gUGFyYW1ldGVyIFN0b3JlXCIsXG4gICAgICBpbmxpbmVQb2xpY2llczoge1xuICAgICAgICBBbXBsaWZ5QXV0aFBhcmFtUG9saWN5OiBhbXBsaWZ5QXV0aFBhcmFtUG9saWN5LFxuICAgICAgICBQdWxsQ29kZUNvbW1pdFBvbGljeTogcHVsbENvZGVDb21taXRQb2xpY3ksXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRpb24gb2YgQW1wbGlmeSBBcHBcbiAgICBjb25zdCBhbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnlfYWxwaGEuQXBwKHRoaXMsIFwiUmVhY3RGcm9udGVuZEFwcFwiLCB7XG4gICAgICBzb3VyY2VDb2RlUHJvdmlkZXI6IG5ldyBhbXBsaWZ5X2FscGhhLkNvZGVDb21taXRTb3VyY2VDb2RlUHJvdmlkZXIoe1xuICAgICAgICByZXBvc2l0b3J5LFxuICAgICAgfSksXG4gICAgICByb2xlOiBhbXBsaWZ5RXhlY1JvbGUsXG4gICAgICBidWlsZFNwZWM6IGNvZGVidWlsZC5CdWlsZFNwZWMuZnJvbU9iamVjdFRvWWFtbCh7XG4gICAgICAgIC8vIEFsdGVybmF0aXZlbHkgYWRkIGEgYGFtcGxpZnkueW1sYCB0byB0aGUgcmVwb1xuICAgICAgICB2ZXJzaW9uOiBcIjEuMFwiLFxuICAgICAgICBmcm9udGVuZDoge1xuICAgICAgICAgIHBoYXNlczoge1xuICAgICAgICAgICAgcHJlQnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcbiAgICAgICAgICAgICAgICBcIm5wbSBpbnN0YWxsXCIsXG4gICAgICAgICAgICAgICAgXCJhd3Mgc3NtIGdldC1wYXJhbWV0ZXIgLS1uYW1lICdhbXBmbGl5QmFja2VuZEF1dGhQYXJhbScgLS1xdWVyeSAnUGFyYW1ldGVyLlZhbHVlJyAtLW91dHB1dCB0ZXh0ID4gLi9zcmMvYW1wbGlmeV9hdXRoX2NvbmZpZy5qc29uXCIsXG4gICAgICAgICAgICAgICAgXCJhd3Mgc3NtIGdldC1wYXJhbWV0ZXIgLS1uYW1lICdhcGlHYXRld2F5RW5kcG9pbnRQYXJhbScgLS1xdWVyeSAnUGFyYW1ldGVyLlZhbHVlJyAtLW91dHB1dCB0ZXh0ID4gLi9zcmMvY29tcG9uZW50cy9hcGlfZW5kcG9pbnQuanNvblwiLFxuICAgICAgICAgICAgICBdLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGJ1aWxkOiB7XG4gICAgICAgICAgICAgIGNvbW1hbmRzOiBbXCJucG0gcnVuIGJ1aWxkXCJdLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHBvc3RCdWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1xuICAgICAgICAgICAgICAgIFwiQ09SU19SVUxFPSQoIGF3cyBzc20gZ2V0LXBhcmFtZXRlciAtLW5hbWUgJ3MzQ29yc1J1bGVQYXJhbScgLS1xdWVyeSAnUGFyYW1ldGVyLlZhbHVlJyAtLW91dHB1dCB0ZXh0IClcIixcbiAgICAgICAgICAgICAgICBcIkJVQ0tFVF9OQU1FPSQoIGF3cyBzc20gZ2V0LXBhcmFtZXRlciAtLW5hbWUgJ3MzQnVja2V0TmFtZVBhcmFtJyAtLXF1ZXJ5ICdQYXJhbWV0ZXIuVmFsdWUnIC0tb3V0cHV0IHRleHQgKVwiLCBcbiAgICAgICAgICAgICAgICAnYXdzIHMzYXBpIHB1dC1idWNrZXQtY29ycyAtLWJ1Y2tldCBcIiRCVUNLRVRfTkFNRVwiIC0tY29ycy1jb25maWd1cmF0aW9uIFwiJENPUlNfUlVMRVwiJyxcbiAgICAgICAgICAgICAgXSxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgICBhcnRpZmFjdHM6IHtcbiAgICAgICAgICAgIGJhc2VEaXJlY3Rvcnk6IFwiYnVpbGRcIixcbiAgICAgICAgICAgIGZpbGVzOiBbXCIqKi8qXCJdLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2FjaGU6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXCJub2RlX21vZHVsZXMvKiovKlwiXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgfSk7XG4gICAgLy8gY29ubmVjdCB0byBtYWluIGJyYW5jaCBvZiB0aGUgY29kZSByZXBvXG4gICAgY29uc3QgbWFpbkJyYW5jaCA9IGFtcGxpZnlBcHAuYWRkQnJhbmNoKFwibWFpblwiLCB7XG4gICAgICBhdXRvQnVpbGQ6IHRydWUsXG4gICAgICBicmFuY2hOYW1lOiBcIm1haW5cIixcbiAgICB9KTtcbiAgICAvLyBVUkwgdXNlZCBmb3IgQ09SUyBvcmlnaW5cbiAgICBjb25zdCBhbGxvd09yaWdpblVSTCA9XG4gICAgICBcImh0dHBzOi8vXCIgKyBtYWluQnJhbmNoLmJyYW5jaE5hbWUgKyBcIi5cIiArIGFtcGxpZnlBcHAuZGVmYXVsdERvbWFpbjtcblxuICAgIC8vIENyZWF0ZSBMYW1iZGEgZnVuY3Rpb25zIChidXNpbmVzcyBsb2dpYylcbiAgICBjb25zdCBsaXN0RmlsZUxhbWJkYSA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgXCJMaXN0RmlsZUxhbWJkYVwiLCB7XG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICB1cGxvYWRCdWNrZXROYW1lOiBzM0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBhbGxvd09yaWdpbnM6IGFsbG93T3JpZ2luVVJMLFxuICAgICAgICByZWdpb246IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb24sXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhc1wiKSxcbiAgICAgIGhhbmRsZXI6IFwibGlzdF9maWxlLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM184LFxuICAgIH0pO1xuXG4gICAgY29uc3QgcHJlc2lnbmVkVVJMTGFtYmRhID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCBcIlByZXNpZ25lZFVSTFwiLCB7XG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICB1cGxvYWRCdWNrZXROYW1lOiBzM0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBhbGxvd09yaWdpbnM6IGFsbG93T3JpZ2luVVJMLFxuICAgICAgICByZWdpb246IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb24sXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhc1wiKSxcbiAgICAgIGhhbmRsZXI6IFwicHJlc2lnbmVkVVJMLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM184LFxuICAgIH0pO1xuXG4gICAgcHJlc2lnbmVkVVJMTGFtYmRhLnJvbGU/LmF0dGFjaElubGluZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5KHRoaXMsIFwiYXNzdW1lLXJvbGUtcHJlc2lnbmVkLXBvbGljeVwiLCB7XG4gICAgICAgIHN0YXRlbWVudHM6IFthc3N1bWVSb2xlQ29nbml0b1BvbGljeV0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBwcmVzaWduZWRVUkxMYW1iZGEucm9sZT8uYXR0YWNoSW5saW5lUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgXCJjb2duaXRvLXVzZXItZ3JvdXAtcG9saWN5XCIsIHtcbiAgICAgICAgc3RhdGVtZW50czogW2NvZ25pdG9JRFBBZG1pblBvbGljeV0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBsaXN0RmlsZUxhbWJkYS5yb2xlPy5hdHRhY2hJbmxpbmVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeSh0aGlzLCBcImFzc3VtZS1yb2xlLWxpc3QtcG9saWN5XCIsIHtcbiAgICAgICAgc3RhdGVtZW50czogW2Fzc3VtZVJvbGVDb2duaXRvUG9saWN5XSxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIGxpc3RGaWxlTGFtYmRhLnJvbGU/LmF0dGFjaElubGluZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5KHRoaXMsIFwiY29nbml0by11c2VyLWdyb3VwLWxpc3QtcG9saWN5XCIsIHtcbiAgICAgICAgc3RhdGVtZW50czogW2NvZ25pdG9JRFBBZG1pblBvbGljeV0sXG4gICAgICB9KVxuICAgICk7XG5cbiAgICAvLyBDcmVhdGUgUkVTVCBBUEkgR2F0ZXdheVxuICAgIGNvbnN0IGFwaSA9IG5ldyBhcGlnYXRld2F5LlJlc3RBcGkodGhpcywgXCJkYXRhLWh1Yi1hcGlcIiwge1xuICAgICAgZGVmYXVsdENvcnNQcmVmbGlnaHRPcHRpb25zOiB7XG4gICAgICAgIGFsbG93T3JpZ2luczogW2FsbG93T3JpZ2luVVJMXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbXCJPUFRJT05TLEdFVCxQT1NUXCJdLFxuICAgICAgICBhbGxvd0hlYWRlcnM6IGFwaWdhdGV3YXkuQ29ycy5ERUZBVUxUX0hFQURFUlMsXG4gICAgICAgIGFsbG93Q3JlZGVudGlhbHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgYXBpLnJvb3QuYWRkTWV0aG9kKFwiQU5ZXCIpOyAvL3RvZG8gY2hlY2tcbiAgICBjb25zdCBsaXN0ZG9jcyA9IGFwaS5yb290LmFkZFJlc291cmNlKFwibGlzdC1kb2NzXCIpO1xuICAgIGNvbnN0IHNpZ25lZFVSTCA9IGFwaS5yb290LmFkZFJlc291cmNlKFwic2lnbmVkVVJMXCIpO1xuXG4gICAgY29uc3QgYXV0aCA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiYmxvZ0F1dGhvcml6ZXJcIixcbiAgICAgIHtcbiAgICAgICAgY29nbml0b1VzZXJQb29sczogW3VzZXJQb29sXSxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgbGlzdGRvY3MuYWRkTWV0aG9kKFxuICAgICAgXCJHRVRcIixcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxpc3RGaWxlTGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aCxcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgc2lnbmVkVVJMLmFkZE1ldGhvZChcbiAgICAgIFwiUE9TVFwiLFxuICAgICAgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJlc2lnbmVkVVJMTGFtYmRhKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcjogYXV0aCxcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy8gYWRkIEFQSSBHYXRld2F5IGVuZHBvaW50IHRvIFNTTSBwYXJhbSBzdG9yZSB0byB1c2UgaXQgZnJvbSB0aGUgcmVhY3QgZnJvbnRlbmQgYXBwXG4gICAgY29uc3QgYXBpRW5kcG9pbnRQYXJhbSA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsIFwiYXBpRW5kcG9pbnRQYXJhbVwiLCB7XG4gICAgICBhbGxvd2VkUGF0dGVybjogXCIuKlwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiRW5kcG9pbnQgZm9yIEFQSSBHYXRld2F5XCIsXG4gICAgICBwYXJhbWV0ZXJOYW1lOiBcImFwaUdhdGV3YXlFbmRwb2ludFBhcmFtXCIsXG4gICAgICBzdHJpbmdWYWx1ZTogYHtcImFwaUVuZHBvaW50XCI6IFwiJHthcGkudXJsfVwiLFwicHJlc2lnbmVkUmVzb3VyY2VcIjogXCIke3NpZ25lZFVSTC5wYXRofVwiLFwibGlzdERvY3NSZXNvdXJjZVwiOiBcIiR7bGlzdGRvY3MucGF0aH1cIn1gLFxuICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgfSk7XG5cbiAgICBhbXBsaWZ5RXhlY1JvbGUuYXR0YWNoSW5saW5lUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgXCJhcGlFbmRwb2ludFBhcmFtUG9saWN5XCIsIHtcbiAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHJlc291cmNlczogW2Ake2FwaUVuZHBvaW50UGFyYW0ucGFyYW1ldGVyQXJufWBdLFxuICAgICAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgICAgICBcInNzbTpHZXRQYXJhbWV0ZXJcIixcbiAgICAgICAgICAgIF0sXG4gICAgICAgICAgfSksXG4gICAgICAgIF0sXG4gICAgICB9KVxuICAgICk7XG4gICAgXG4gICAgLy8gYWRkIFMzIGNvcnMgcnVsZSB0byB1c2UgaXQgZnJvbSB0aGUgcmVhY3QgZnJvbnRlbmQgYXBwXG4gICAgY29uc3QgczNDb3JzUnVsZVBhcmFtID0gbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIodGhpcywgXCJzM0NvcnNSdWxlUGFyYW1cIiwge1xuICAgICAgYWxsb3dlZFBhdHRlcm46IFwiLipcIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlMzIGJ1Y2tldCBDT1JTIHJ1bGVcIixcbiAgICAgIHBhcmFtZXRlck5hbWU6IFwiczNDb3JzUnVsZVBhcmFtXCIsXG4gICAgICBzdHJpbmdWYWx1ZTogYHtcIkNPUlNSdWxlc1wiIDogW3tcIkFsbG93ZWRIZWFkZXJzXCI6W1wiKlwiXSxcIkFsbG93ZWRNZXRob2RzXCI6W1wiR0VUXCIsXCJQT1NUXCIsIFwiUFVUXCJdLFwiQWxsb3dlZE9yaWdpbnNcIjpbXCIke2FsbG93T3JpZ2luVVJMfVwiXX1dfWAsXG4gICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICB9KTtcbiAgICBjb25zdCBzM0J1Y2tldE5hbWVQYXJhbSA9IG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHRoaXMsIFwiczNCdWNrZXROYW1lUGFyYW1cIiwge1xuICAgICAgYWxsb3dlZFBhdHRlcm46IFwiLipcIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcIlMzIGJ1Y2tldCBuYW1lXCIsXG4gICAgICBwYXJhbWV0ZXJOYW1lOiBcInMzQnVja2V0TmFtZVBhcmFtXCIsXG4gICAgICBzdHJpbmdWYWx1ZTogczNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgIH0pO1xuXG4gICAgYW1wbGlmeUV4ZWNSb2xlLmF0dGFjaElubGluZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5KHRoaXMsIFwiczNDb3JzUnVsZVBhcmFtUG9saWN5XCIsIHtcbiAgICAgICAgc3RhdGVtZW50czogW1xuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHJlc291cmNlczogW3MzQ29yc1J1bGVQYXJhbS5wYXJhbWV0ZXJBcm4sczNCdWNrZXROYW1lUGFyYW0ucGFyYW1ldGVyQXJuXSxcbiAgICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgICAgXCJzc206R2V0UGFyYW1ldGVyXCIsXG4gICAgICAgICAgICBdLFxuICAgICAgICAgIH0pLFxuICAgICAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgICAgIHJlc291cmNlczogW3MzQnVja2V0LmJ1Y2tldEFybl0sXG4gICAgICAgICAgICBhY3Rpb25zOiBbXCJzMzpQdXRCdWNrZXRDT1JTXCJdLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdLFxuICAgICAgfSlcbiAgICApO1xuXG4gICAgLy8gdHJpZ2dlciBkZXBsb3ltZW50IG9mIGFtcGxpZnkgaG9zdGVkIHJlYWN0IGFwcFxuICAgIC8vIHNlZSBodHRwczovL2dpdGh1Yi5jb20vYXdzL2F3cy1jZGsvaXNzdWVzLzE5MjcyIHdoZW4gdXBkYXRpbmcgdGhlIGhhbmRsZXJcbiAgICBuZXcgdHJpZ2dlcnMuVHJpZ2dlckZ1bmN0aW9uKGNkay5TdGFjay5vZih0aGlzKSwgXCJjZGtUcmlnZ2VyQW1wbGlmeVN0YXJ0Sm9iXCIsIHtcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIGFtcGxpZnlBcHBJZDogYW1wbGlmeUFwcC5hcHBJZCxcbiAgICAgICAgYnJhbmNoTmFtZTogbWFpbkJyYW5jaC5icmFuY2hOYW1lLFxuICAgICAgfSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldChcImxhbWJkYXMvY2RrXCIpLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuUFlUSE9OXzNfOCxcbiAgICAgIGhhbmRsZXI6IFwidHJpZ2dlcl9hbXBsaWZ5X3N0YXJ0Sm9iLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBleGVjdXRlT25IYW5kbGVyQ2hhbmdlOiBmYWxzZSxcbiAgICAgIGluaXRpYWxQb2xpY3k6IFtcbiAgICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIHJlc291cmNlczogW21haW5CcmFuY2guYXJuICsgXCIvam9icy8qXCJdLFxuICAgICAgICAgIGFjdGlvbnM6IFtcImFtcGxpZnk6U3RhcnRKb2JcIl0sXG4gICAgICAgIH0pLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIHRyaWdnZXIgdG8gc2V0IFMzIGJ1Y2tldCBDT1JTIHJ1bGVcbiAgICAvLyBzZWUgaHR0cHM6Ly9naXRodWIuY29tL2F3cy9hd3MtY2RrL2lzc3Vlcy8xOTI3MiB3aGVuIHVwZGF0aW5nIHRoZSBoYW5kbGVyXG4gICAgLy8gY29uc3QgY29yc1RyaWdnZXIgPSBuZXcgdHJpZ2dlcnMuVHJpZ2dlckZ1bmN0aW9uKGNkay5TdGFjay5vZih0aGlzKSwgXCJjZGtUcmlnZ2VyUzNDT1JTUnVsZVNldFwiLCB7XG4gICAgLy8gICBlbnZpcm9ubWVudDoge1xuICAgIC8vICAgICBjb3JzUnVsZTogYHtcIkNPUlNSdWxlc1wiIDogW3tcIkFsbG93ZWRIZWFkZXJzXCI6W1wiKlwiXSxcIkFsbG93ZWRNZXRob2RzXCI6W1wiR0VUXCIsXCJQT1NUXCIsIFwiUFVUXCJdLFwiQWxsb3dlZE9yaWdpbnNcIjpbXCIke2FsbG93T3JpZ2luVVJMfVwiXX1dfWAsXG4gICAgLy8gICAgIHJlZ2lvbk5hbWU6IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb24sXG4gICAgLy8gICAgIGJ1Y2tldE5hbWU6IHMzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgLy8gICB9LFxuICAgIC8vICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhcy9jZGtcIiksXG4gICAgLy8gICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM184LFxuICAgIC8vICAgaGFuZGxlcjogXCJ0cmlnZ2VyX3MzX2NvcnNSdWxlLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgLy8gICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgLy8gICBleGVjdXRlT25IYW5kbGVyQ2hhbmdlOiBmYWxzZSxcbiAgICAvLyAgIGluaXRpYWxQb2xpY3k6IFtcbiAgICAvLyAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgIC8vICAgICAgIHJlc291cmNlczogW3MzQnVja2V0LmJ1Y2tldEFybl0sXG4gICAgLy8gICAgICAgYWN0aW9uczogW1wiczM6UHV0QnVja2V0Q09SU1wiXSxcbiAgICAvLyAgICAgfSksXG4gICAgLy8gICBdLFxuICAgIC8vIH0pO1xuICAgIFxuICAgIC8vdGVzdGluZyBvbmx6IC0gc2VwYXJhdGluZyBsYW1iZGEgZnVuY3Rpb24gZnJvbSB0aGUgdHJpZ2dlclxuICAgIC8vIGNvbnN0IGNvcnNMYW1iZGEgPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsIFwiY29yc0xhbWJkYVwiLCB7XG4gICAgLy8gICBlbnZpcm9ubWVudDoge1xuICAgIC8vICAgICBjb3JzUnVsZTogYHtcIkNPUlNSdWxlc1wiIDogW3tcIkFsbG93ZWRIZWFkZXJzXCI6W1wiKlwiXSxcIkFsbG93ZWRNZXRob2RzXCI6W1wiR0VUXCIsXCJQT1NUXCIsIFwiUFVUXCJdLFwiQWxsb3dlZE9yaWdpbnNcIjpbXCIke2FsbG93T3JpZ2luVVJMfVwiXX1dfWAsXG4gICAgLy8gICAgIHJlZ2lvbk5hbWU6IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb24sXG4gICAgLy8gICAgIGJ1Y2tldE5hbWU6IHMzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgLy8gICB9LFxuICAgIC8vICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFwibGFtYmRhcy9jZGtcIiksXG4gICAgLy8gICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5QWVRIT05fM184LFxuICAgIC8vICAgaGFuZGxlcjogXCJ0cmlnZ2VyX3MzX2NvcnNSdWxlLmxhbWJkYV9oYW5kbGVyXCIsXG4gICAgLy8gICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgLy8gICBpbml0aWFsUG9saWN5OiBbXG4gICAgLy8gICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAvLyAgICAgICByZXNvdXJjZXM6IFtzM0J1Y2tldC5idWNrZXRBcm5dLFxuICAgIC8vICAgICAgIGFjdGlvbnM6IFtcInMzOlB1dEJ1Y2tldENPUlNcIl0sXG4gICAgLy8gICAgIH0pLFxuICAgIC8vICAgXSxcbiAgICAvLyB9KTtcbiAgICBcbiAgICAvLyBjb3JzTGFtYmRhLmdyYW50SW52b2tlKG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpKTtcbiAgICAvLyBjb3JzTGFtYmRhLmN1cnJlbnRWZXJzaW9uLmdyYW50SW52b2tlKG5ldyBpYW0uU2VydmljZVByaW5jaXBhbChcImxhbWJkYS5hbWF6b25hd3MuY29tXCIpKTtcbiAgICBcbiAgICAvLyBjb25zdCBjb3JzVHJpZ2dlciA9IG5ldyB0cmlnZ2Vycy5UcmlnZ2VyKGNkay5TdGFjay5vZih0aGlzKSwgXCJjZGtUcmlnZ2VyUzNDT1JTUnVsZVNldFwiLCB7XG4gICAgLy8gICBoYW5kbGVyOiBjb3JzTGFtYmRhLFxuICAgIC8vICAgZXhlY3V0ZU9uSGFuZGxlckNoYW5nZTogZmFsc2UsXG4gICAgLy8gfSk7XG4gICAgLy8gY29yc1RyaWdnZXIubm9kZS5hZGREZXBlbmRlbmN5KGNvcnNMYW1iZGEpO1xuXG5cbiAgICAvLyByZWxldmFudCBzdGFjayBvdXRwdXRzXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJBUElHYXRld2F5RW5kcG9pbnRcIiwge1xuICAgICAgdmFsdWU6IGFwaS51cmwsXG4gICAgfSk7XG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgXCJkb2N1bWVudFN0b3JlQnVja2V0TmFtZVwiLCB7XG4gICAgICB2YWx1ZTogczNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcInJlZ2lvblwiLCB7XG4gICAgICB2YWx1ZTogY2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbixcbiAgICB9KTtcbiAgICAvLyBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImNvcnNSdWxlXCIsIHtcbiAgICAvLyAgIHZhbHVlOiBge1wiQ09SU1J1bGVzXCIgOiBbe1wiQWxsb3dlZEhlYWRlcnNcIjpbXCIqXCJdLFwiQWxsb3dlZE1ldGhvZHNcIjpbXCJHRVRcIixcIlBPU1RcIiwgXCJQVVRcIl0sXCJBbGxvd2VkT3JpZ2luc1wiOltcIiR7YWxsb3dPcmlnaW5VUkx9XCJdfV19YCxcbiAgICAvLyB9KTtcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCBcImFtcGxpZnlBcHBVUkxcIiwge1xuICAgICAgdmFsdWU6IGFsbG93T3JpZ2luVVJMLFxuICAgIH0pO1xuICAgIC8vIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsIFwiYW1wbGlmeUF1dGhDb25maWdcIiwge1xuICAgIC8vICAgdmFsdWU6IGB7XCJCbG9nc2VyaWVzU3RhY2tcIjp7XCJidWNrZXROYW1lXCI6IFwiJHtcbiAgICAvLyAgICAgczNCdWNrZXQuYnVja2V0TmFtZVxuICAgIC8vICAgfVwiLFwidXNlclBvb2xDbGllbnRJZFwiOiBcIiR7dXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZH1cIixcInJlZ2lvblwiOiBcIiR7XG4gICAgLy8gICAgIGNkay5TdGFjay5vZih0aGlzKS5yZWdpb25cbiAgICAvLyAgIH1cIixcInVzZXJQb29sSWRcIjogXCIke3VzZXJQb29sLnVzZXJQb29sSWR9XCIsXCJpZGVudGl0eVBvb2xJZFwiOiBcIiR7XG4gICAgLy8gICAgIGlkZW50aXR5UG9vbC5yZWZcbiAgICAvLyAgIH1cIn19YCxcbiAgICAvLyB9KTtcbiAgfVxufVxuIl19