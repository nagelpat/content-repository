"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogseriesStack = void 0;
const aws_cdk_lib_1 = require("aws-cdk-lib");
const cdk = require("aws-cdk-lib");
const apigateway = require("aws-cdk-lib/aws-apigateway");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");
const s3 = require("aws-cdk-lib/aws-s3");
const codecommit = require("aws-cdk-lib/aws-codecommit");
const amplify_alpha = require("@aws-cdk/aws-amplify-alpha");
const codebuild = require("aws-cdk-lib/aws-codebuild");
const lambda = require("aws-cdk-lib/aws-lambda-nodejs");
// import * as sqs from 'aws-cdk-lib/aws-sqs';
class BlogseriesStack extends aws_cdk_lib_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const userPool = new cognito.UserPool(this, 'userpool', {
            userPoolName: 'blog-user-pool',
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
            removalPolicy: cdk.RemovalPolicy.RETAIN,
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
            .withCustomAttributes(...['group', 'isAdmin']);
        const clientWriteAttributes = new cognito.ClientAttributes()
            .withStandardAttributes({
            ...standardCognitoAttributes,
            emailVerified: false,
            phoneNumberVerified: false,
        })
            .withCustomAttributes(...['group']);
        // //  User Pool Client
        //const client = userPool.addClient('app-client',
        const userPoolClient = new cognito.UserPoolClient(this, 'blog-userpool-client', {
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
        const identityPool = new cognito.CfnIdentityPool(this, 'blog-identity-pool', {
            identityPoolName: 'blog-identity-pool',
            allowUnauthenticatedIdentities: false,
            cognitoIdentityProviders: [
                {
                    clientId: userPoolClient.userPoolClientId,
                    providerName: userPool.userPoolProviderName,
                },
            ],
        });
        // create User 
        const isAnonymousCognitoGroupRole = new iam.Role(this, 'anonymous-group-role', {
            description: 'Default role for anonymous users',
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'unauthenticated',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        const isUserCognitoGroupRole = new iam.Role(this, 'users-group-role', {
            description: 'Default role for authenticated users',
            assumedBy: new iam.FederatedPrincipal('cognito-identity.amazonaws.com', {
                StringEquals: {
                    'cognito-identity.amazonaws.com:aud': identityPool.ref,
                },
                'ForAnyValue:StringLike': {
                    'cognito-identity.amazonaws.com:amr': 'authenticated',
                },
            }, 'sts:AssumeRoleWithWebIdentity'),
            managedPolicies: [
                iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
            ],
        });
        new cognito.CfnIdentityPoolRoleAttachment(this, 'identity-pool-role-attachment', {
            identityPoolId: identityPool.ref,
            roles: {
                authenticated: isUserCognitoGroupRole.roleArn,
                unauthenticated: isAnonymousCognitoGroupRole.roleArn,
            },
            roleMappings: {
                mapping: {
                    type: 'Token',
                    ambiguousRoleResolution: 'Deny',
                    identityProvider: `cognito-idp.${cdk.Stack.of(this).region}.amazonaws.com/${userPool.userPoolId}:${userPoolClient.userPoolClientId}`,
                },
            },
        });
        const api = new apigateway.RestApi(this, 'data-hub', { defaultCorsPreflightOptions: {
                allowOrigins: apigateway.Cors.ALL_ORIGINS,
                allowMethods: apigateway.Cors.ALL_METHODS,
                allowHeaders: apigateway.Cors.DEFAULT_HEADERS,
                allowCredentials: true,
            } }); //TODO update with final web hosting of front-end
        //declare const api: apigateway.Resource;
        //Declare the User Pool Group IAM role
        /*
          const C1groupIAMrole = new iam.Role(this, 'C1Role', {
            assumedBy: new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
              'StringEquals': {
                'cognito-identity.amazonaws.com:aud': identityPool.ref,
               },
            })
          });
          
        
          
          const C2groupIAMrole = new iam.Role(this, 'C2Role', {
            assumedBy: new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
              'StringEquals': {
                'cognito-identity.amazonaws.com:aud': identityPool.ref,
               },
            })
          });*/
        const C1groupIAMrole = new iam.Role(this, 'C1Role', {
            assumedBy: new iam.CompositePrincipal(new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
                'StringEquals': {
                    'cognito-identity.amazonaws.com:aud': identityPool.ref,
                },
            }), new iam.AccountPrincipal('166654051768'))
        });
        const C2groupIAMrole = new iam.Role(this, 'C2Role', {
            assumedBy: new iam.CompositePrincipal(new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
                'StringEquals': {
                    'cognito-identity.amazonaws.com:aud': identityPool.ref,
                },
            }), new iam.AccountPrincipal('166654051768'))
        });
        const AdminGroupIAMrole = new iam.Role(this, 'AdminRole', {
            assumedBy: new iam.CompositePrincipal(new iam.WebIdentityPrincipal('cognito-identity.amazonaws.com', {
                'StringEquals': {
                    'cognito-identity.amazonaws.com:aud': identityPool.ref,
                },
            }), new iam.AccountPrincipal('166654051768'))
        });
        // create s3 bucket to upload documents
        const s3Bucket = new s3.Bucket(this, 's3-bucket', {
            bucketName: 'blog-bucket3-sddsi',
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
                    allowedOrigins: ['*'],
                    allowedHeaders: ['*'],
                },
            ],
        });
        // permission to the bucket - To Do permission S3 prefix wise
        s3Bucket.grantReadWrite(C1groupIAMrole);
        s3Bucket.grantReadWrite(C2groupIAMrole);
        s3Bucket.grantReadWrite(AdminGroupIAMrole);
        // Lambda Functions
        const listFileLambda = new lambda.NodejsFunction(this, 'ListFileLambda', {
            environment: {
                uploadBucketName: s3Bucket.bucketName,
            },
            bundling: {
                nodeModules: ['jsonwebtoken'],
                externalModules: [
                    'aws-sdk' // Use the 'aws-sdk' available in the Lambda runtime
                ],
            },
            //code: lambda.Code.fromAsset('lambdas'),
            entry: 'lambdas/list_file.js',
            handler: 'handler',
            timeout: cdk.Duration.seconds(30),
        });
        const uploadFileLambda = new lambda.NodejsFunction(this, 'UploadFileLambda', {
            environment: {
                uploadBucketName: s3Bucket.bucketName,
            },
            bundling: {
                nodeModules: ['jsonwebtoken'],
                externalModules: [
                    'aws-sdk' // Use the 'aws-sdk' available in the Lambda runtime
                ],
            },
            //code: lambda.Code.fromAsset('lambdas'),
            entry: 'lambdas/upload_file.js',
            handler: 'handler',
            timeout: cdk.Duration.seconds(30),
        });
        const presignedURL = new lambda.NodejsFunction(this, 'PresignedURL', {
            environment: {
                uploadBucketName: s3Bucket.bucketName,
            },
            bundling: {
                nodeModules: ['jsonwebtoken'],
                externalModules: [
                    'aws-sdk' // Use the 'aws-sdk' available in the Lambda runtime
                ],
            },
            //code: lambda.Code.fromAsset('lambdas/presignedURL'),
            entry: 'lambdas/presignedURL.js',
            handler: 'handler',
            timeout: cdk.Duration.seconds(30),
        });
        //Declare the User Pool Group
        const cfnUserPoolGroupC1 = new cognito.CfnUserPoolGroup(this, 'C1', {
            userPoolId: userPool.userPoolId,
            // the properties below are optional
            description: 'C1 group',
            groupName: 'C1',
            precedence: 2,
            roleArn: C1groupIAMrole.roleArn,
        });
        const cfnUserPoolGroupC2 = new cognito.CfnUserPoolGroup(this, 'C2', {
            userPoolId: userPool.userPoolId,
            // the properties below are optional
            description: 'C2 group',
            groupName: 'C2',
            precedence: 2,
            roleArn: C2groupIAMrole.roleArn,
        });
        const cfnUserPoolGroupAdmin = new cognito.CfnUserPoolGroup(this, 'Admin', {
            userPoolId: userPool.userPoolId,
            // the properties below are optional
            description: 'Admin group',
            groupName: 'Admin',
            precedence: 1,
            roleArn: AdminGroupIAMrole.roleArn,
        });
        //Create API Gateway backed by Lambda functions as microservices for user actions like save document, list documents, etc. 
        /*
        const corsOptions = {
            allowOrigins: Cors.ALL_ORIGINS,
            allowHeaders: Cors.DEFAULT_HEADERS,
            allowMethods: Cors.ALL_METHODS,
          };
        
      
        const api = new apigateway.RestApi(this, 'data-hub',{defaultCorsPreflightOptions: {
              allowHeaders: [
                'Content-Type',
                'X-Amz-Date',
                'Authorization',
                'X-Api-Key',
              ],
              allowMethods: ['OPTIONS', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
              allowCredentials: true,
              allowOrigins: ['*'],},}); //TODO update with final web hosting of front-end
        //declare const api: apigateway.Resource;
        
        */
        // create a S3 put policy statement
        const s3PutBucketPolicy = new iam.PolicyStatement({
            actions: ['s3:PutObject'],
            resources: [`${s3Bucket.bucketArn}/*`],
        });
        const s3ListBucketPolicy = new iam.PolicyStatement({
            actions: ['s3:ListBucket'],
            resources: [`${s3Bucket.bucketArn}`],
        });
        const assumeRoleCognito = new iam.PolicyStatement({
            actions: ['sts:AssumeRole'],
            resources: [`${s3Bucket.bucketArn}`],
        });
        // add the policy to the Function's role
        /*presignedURL.role?.attachInlinePolicy(
          new iam.Policy(this, 'put-bucket-policy', {
            statements: [s3PutBucketPolicy],
          }),
        );
        
        listFileLambda.role?.attachInlinePolicy(
          new iam.Policy(this, 'list-bucket-policy', {
            statements: [s3ListBucketPolicy],
          }),
        );*/
        //const handler: lambda.Function;
        api.root.addMethod('ANY');
        const uploaddoc = api.root.addResource('upload-doc');
        //uploaddoc.addMethod('POST');
        const listdocs = api.root.addResource('list-docs');
        //listdocs.addMethod('GET');
        const signedURL = api.root.addResource('signedURL');
        const auth = new apigateway.CognitoUserPoolsAuthorizer(this, 'blogAuthorizer', {
            cognitoUserPools: [userPool]
        });
        listdocs.addMethod('GET', new apigateway.LambdaIntegration(listFileLambda), {
            authorizer: auth,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        uploaddoc.addMethod('POST', new apigateway.LambdaIntegration(uploadFileLambda), {
            authorizer: auth,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        signedURL.addMethod('POST', new apigateway.LambdaIntegration(presignedURL), {
            authorizer: auth,
            authorizationType: apigateway.AuthorizationType.COGNITO,
        });
        // Creation of the source control repository
        const repository = new codecommit.Repository(this, "CodeRepoBlogpost1", {
            repositoryName: "blogpost1-repo",
            description: "code repo for OpenSearch free text and semantic search",
        });
        // Creation of Amplify App
        const amplifyApp = new amplify_alpha.App(this, "AmplifyReactApp", {
            sourceCodeProvider: new amplify_alpha.CodeCommitSourceCodeProvider({
                repository,
            }),
            buildSpec: codebuild.BuildSpec.fromObjectToYaml({
                // Alternatively add a `amplify.yml` to the repo
                version: "1.0",
                frontend: {
                    phases: {
                        preBuild: {
                            commands: ["cd blog-files/react-ui/frontend", "npm install"],
                        },
                        build: {
                            commands: ["npm run build"],
                        },
                    },
                    artifacts: {
                        baseDirectory: "blog-files/react-ui/frontend/build",
                        files: ["**/*"],
                    },
                    cache: {
                        commands: ["blog-files/react-ui/frontend/node_modules/**/*"],
                    },
                },
            }),
        });
        const masterBranch = amplifyApp.addBranch("master");
        new cdk.CfnOutput(this, 'userPoolId', {
            value: userPool.userPoolId,
        });
        new cdk.CfnOutput(this, 'userPoolClientId', {
            value: userPoolClient.userPoolClientId,
        });
        new cdk.CfnOutput(this, 'bucketName', {
            value: s3Bucket.bucketName,
        });
        new cdk.CfnOutput(this, 'identityPoolId', {
            value: identityPool.ref,
        });
        new cdk.CfnOutput(this, 'region', {
            value: cdk.Stack.of(this).region,
        });
        // The code that defines your stack goes here
        // example resource
        // const queue = new sqs.Queue(this, 'BackendInfraQueue', {
        //   visibilityTimeout: cdk.Duration.seconds(300)
    }
}
exports.BlogseriesStack = BlogseriesStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvZ3Nlcmllcy1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImJsb2dzZXJpZXMtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsNkNBQWdEO0FBRWhELG1DQUFtQztBQVFuQyx5REFBeUQ7QUFDekQsbURBQW1EO0FBQ25ELDJDQUEyQztBQUMzQyx5Q0FBeUM7QUFDekMseURBQXlEO0FBQ3pELDREQUE0RDtBQUM1RCx1REFBdUQ7QUFDdkQsd0RBQXdEO0FBRXhELDhDQUE4QztBQUU5QyxNQUFhLGVBQWdCLFNBQVEsbUJBQUs7SUFDeEMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFrQjtRQUMxRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLFFBQVEsR0FBRyxJQUFJLE9BQU8sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRTtZQUN0RCxZQUFZLEVBQUUsZ0JBQWdCO1lBQzlCLGlCQUFpQixFQUFFLEtBQUs7WUFDeEIsYUFBYSxFQUFFO2dCQUNiLEtBQUssRUFBRSxJQUFJO2FBQ1o7WUFDRCxVQUFVLEVBQUU7Z0JBQ1YsS0FBSyxFQUFFLElBQUk7YUFDWjtZQUNELGtCQUFrQixFQUFFO2dCQUNsQixTQUFTLEVBQUU7b0JBQ1QsUUFBUSxFQUFFLElBQUk7b0JBQ2QsT0FBTyxFQUFFLElBQUk7aUJBQ2Q7Z0JBQ0QsVUFBVSxFQUFFO29CQUNWLFFBQVEsRUFBRSxJQUFJO29CQUNkLE9BQU8sRUFBRSxJQUFJO2lCQUNkO2FBQ0Y7WUFDRCxnQkFBZ0IsRUFBRTtnQkFDaEIsS0FBSyxFQUFFLElBQUksT0FBTyxDQUFDLGVBQWUsQ0FBQyxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUMsQ0FBQztnQkFDbkQsT0FBTyxFQUFFLElBQUksT0FBTyxDQUFDLGVBQWUsQ0FBQyxFQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUMsQ0FBQzthQUN0RDtZQUNELGNBQWMs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cm9wcyB9IGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbi8vaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgc2ZuIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zJztcbmltcG9ydCAqIGFzIHRhc2tzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zdGVwZnVuY3Rpb25zLXRhc2tzJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCB7IEF0dHJpYnV0ZVR5cGUsIFRhYmxlIH0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGZzIGZyb20gJ2ZzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBhcGlnYXRld2F5IGZyb20gJ2F3cy1jZGstbGliL2F3cy1hcGlnYXRld2F5JztcbmltcG9ydCAqIGFzIGNvZ25pdG8gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZ25pdG8nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNvZGVjb21taXQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVjb21taXQnO1xuaW1wb3J0ICogYXMgYW1wbGlmeV9hbHBoYSBmcm9tIFwiQGF3cy1jZGsvYXdzLWFtcGxpZnktYWxwaGFcIjtcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XG5cbi8vIGltcG9ydCAqIGFzIHNxcyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtc3FzJztcblxuZXhwb3J0IGNsYXNzIEJsb2dzZXJpZXNTdGFjayBleHRlbmRzIFN0YWNrIHtcbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM/OiBTdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICBjb25zdCB1c2VyUG9vbCA9IG5ldyBjb2duaXRvLlVzZXJQb29sKHRoaXMsICd1c2VycG9vbCcsIHtcbiAgICAgIHVzZXJQb29sTmFtZTogJ2Jsb2ctdXNlci1wb29sJyxcbiAgICAgIHNlbGZTaWduVXBFbmFibGVkOiBmYWxzZSxcbiAgICAgIHNpZ25JbkFsaWFzZXM6IHtcbiAgICAgICAgZW1haWw6IHRydWUsXG4gICAgICB9LFxuICAgICAgYXV0b1ZlcmlmeToge1xuICAgICAgICBlbWFpbDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBzdGFuZGFyZEF0dHJpYnV0ZXM6IHtcbiAgICAgICAgZ2l2ZW5OYW1lOiB7XG4gICAgICAgICAgcmVxdWlyZWQ6IHRydWUsXG4gICAgICAgICAgbXV0YWJsZTogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgICAgZmFtaWx5TmFtZToge1xuICAgICAgICAgIHJlcXVpcmVkOiB0cnVlLFxuICAgICAgICAgIG11dGFibGU6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgY3VzdG9tQXR0cmlidXRlczoge1xuICAgICAgICBncm91cDogbmV3IGNvZ25pdG8uU3RyaW5nQXR0cmlidXRlKHttdXRhYmxlOiB0cnVlfSksXG4gICAgICAgIGlzQWRtaW46IG5ldyBjb2duaXRvLlN0cmluZ0F0dHJpYnV0ZSh7bXV0YWJsZTogdHJ1ZX0pLFxuICAgICAgfSxcbiAgICAgIHBhc3N3b3JkUG9saWN5OiB7XG4gICAgICAgIG1pbkxlbmd0aDogNixcbiAgICAgICAgcmVxdWlyZUxvd2VyY2FzZTogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZURpZ2l0czogdHJ1ZSxcbiAgICAgICAgcmVxdWlyZVVwcGVyY2FzZTogZmFsc2UsXG4gICAgICAgIHJlcXVpcmVTeW1ib2xzOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhY2NvdW50UmVjb3Zlcnk6IGNvZ25pdG8uQWNjb3VudFJlY292ZXJ5LkVNQUlMX09OTFksXG4gICAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4sXG4gICAgfSk7XG4gIFxuXG5cbiAgLy8gVXNlciBQb29sIENsaWVudCBhdHRyaWJ1dGVzXG4gIGNvbnN0IHN0YW5kYXJkQ29nbml0b0F0dHJpYnV0ZXMgPSB7XG4gICAgZ2l2ZW5OYW1lOiB0cnVlLFxuICAgIGZhbWlseU5hbWU6IHRydWUsXG4gICAgZW1haWw6IHRydWUsXG4gICAgZW1haWxWZXJpZmllZDogdHJ1ZSxcbiAgICBhZGRyZXNzOiB0cnVlLFxuICAgIGJpcnRoZGF0ZTogdHJ1ZSxcbiAgICBnZW5kZXI6IHRydWUsXG4gICAgbG9jYWxlOiB0cnVlLFxuICAgIG1pZGRsZU5hbWU6IHRydWUsXG4gICAgZnVsbG5hbWU6IHRydWUsXG4gICAgbmlja25hbWU6IHRydWUsXG4gICAgcGhvbmVOdW1iZXI6IHRydWUsXG4gICAgcGhvbmVOdW1iZXJWZXJpZmllZDogdHJ1ZSxcbiAgICBwcm9maWxlUGljdHVyZTogdHJ1ZSxcbiAgICBwcmVmZXJyZWRVc2VybmFtZTogdHJ1ZSxcbiAgICBwcm9maWxlUGFnZTogdHJ1ZSxcbiAgICB0aW1lem9uZTogdHJ1ZSxcbiAgICBsYXN0VXBkYXRlVGltZTogdHJ1ZSxcbiAgICB3ZWJzaXRlOiB0cnVlLFxuICB9O1xuICBcbiAgY29uc3QgY2xpZW50UmVhZEF0dHJpYnV0ZXMgPSBuZXcgY29nbml0by5DbGllbnRBdHRyaWJ1dGVzKClcbiAgICAud2l0aFN0YW5kYXJkQXR0cmlidXRlcyhzdGFuZGFyZENvZ25pdG9BdHRyaWJ1dGVzKVxuICAgIC53aXRoQ3VzdG9tQXR0cmlidXRlcyguLi5bJ2dyb3VwJywnaXNBZG1pbiddKTtcbiAgXG4gIGNvbnN0IGNsaWVudFdyaXRlQXR0cmlidXRlcyA9IG5ldyBjb2duaXRvLkNsaWVudEF0dHJpYnV0ZXMoKVxuICAgIC53aXRoU3RhbmRhcmRBdHRyaWJ1dGVzKHtcbiAgICAgIC4uLnN0YW5kYXJkQ29nbml0b0F0dHJpYnV0ZXMsXG4gICAgICBlbWFpbFZlcmlmaWVkOiBmYWxzZSxcbiAgICAgIHBob25lTnVtYmVyVmVyaWZpZWQ6IGZhbHNlLFxuICAgIH0pXG4gICAgLndpdGhDdXN0b21BdHRyaWJ1dGVzKC4uLlsnZ3JvdXAnXSk7XG4gIFxuICAvLyAvLyAgVXNlciBQb29sIENsaWVudFxuICAvL2NvbnN0IGNsaWVudCA9IHVzZXJQb29sLmFkZENsaWVudCgnYXBwLWNsaWVudCcsXG4gIGNvbnN0IHVzZXJQb29sQ2xpZW50ID0gbmV3IGNvZ25pdG8uVXNlclBvb2xDbGllbnQodGhpcywgJ2Jsb2ctdXNlcnBvb2wtY2xpZW50Jywge1xuICAgIHVzZXJQb29sLFxuICAgIGF1dGhGbG93czoge1xuICAgICAgYWRtaW5Vc2VyUGFzc3dvcmQ6IHRydWUsXG4gICAgICBjdXN0b206IHRydWUsXG4gICAgICB1c2VyU3JwOiB0cnVlLFxuICAgIH0sXG4gICAgc3VwcG9ydGVkSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgIGNvZ25pdG8uVXNlclBvb2xDbGllbnRJZGVudGl0eVByb3ZpZGVyLkNPR05JVE8sXG4gICAgXSxcbiAgICByZWFkQXR0cmlidXRlczogY2xpZW50UmVhZEF0dHJpYnV0ZXMsXG4gICAgd3JpdGVBdHRyaWJ1dGVzOiBjbGllbnRXcml0ZUF0dHJpYnV0ZXMsXG4gIH0pO1xuICBcbi8vIGNyZWF0ZSBDb2duaXRvIElkZW50aXR5IFBvb2wgaWRcbiAgY29uc3QgaWRlbnRpdHlQb29sID0gbmV3IGNvZ25pdG8uQ2ZuSWRlbnRpdHlQb29sKHRoaXMsICdibG9nLWlkZW50aXR5LXBvb2wnLCB7XG4gICAgICAgIGlkZW50aXR5UG9vbE5hbWU6ICdibG9nLWlkZW50aXR5LXBvb2wnLFxuICAgICAgICBhbGxvd1VuYXV0aGVudGljYXRlZElkZW50aXRpZXM6IGZhbHNlLFxuICAgICAgICBjb2duaXRvSWRlbnRpdHlQcm92aWRlcnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjbGllbnRJZDogdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgICAgICAgIHByb3ZpZGVyTmFtZTogdXNlclBvb2wudXNlclBvb2xQcm92aWRlck5hbWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuICAgIFxuLy8gY3JlYXRlIFVzZXIgXG5cbiAgY29uc3QgaXNBbm9ueW1vdXNDb2duaXRvR3JvdXBSb2xlID0gbmV3IGlhbS5Sb2xlKFxuICAgICAgdGhpcyxcbiAgICAgICdhbm9ueW1vdXMtZ3JvdXAtcm9sZScsXG4gICAgICB7XG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRGVmYXVsdCByb2xlIGZvciBhbm9ueW1vdXMgdXNlcnMnLFxuICAgICAgICBhc3N1bWVkQnk6IG5ldyBpYW0uRmVkZXJhdGVkUHJpbmNpcGFsKFxuICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nLFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIFN0cmluZ0VxdWFsczoge1xuICAgICAgICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgJ0ZvckFueVZhbHVlOlN0cmluZ0xpa2UnOiB7XG4gICAgICAgICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YW1yJzogJ3VuYXV0aGVudGljYXRlZCcsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgJ3N0czpBc3N1bWVSb2xlV2l0aFdlYklkZW50aXR5JyxcbiAgICAgICAgKSxcbiAgICAgICAgbWFuYWdlZFBvbGljaWVzOiBbXG4gICAgICAgICAgaWFtLk1hbmFnZWRQb2xpY3kuZnJvbUF3c01hbmFnZWRQb2xpY3lOYW1lKFxuICAgICAgICAgICAgJ3NlcnZpY2Utcm9sZS9BV1NMYW1iZGFCYXNpY0V4ZWN1dGlvblJvbGUnLFxuICAgICAgICAgICksXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgICk7XG4gIGNvbnN0IGlzVXNlckNvZ25pdG9Hcm91cFJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ3VzZXJzLWdyb3VwLXJvbGUnLCB7XG4gIGRlc2NyaXB0aW9uOiAnRGVmYXVsdCByb2xlIGZvciBhdXRoZW50aWNhdGVkIHVzZXJzJyxcbiAgYXNzdW1lZEJ5OiBuZXcgaWFtLkZlZGVyYXRlZFByaW5jaXBhbChcbiAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJyxcbiAgICB7XG4gICAgICBTdHJpbmdFcXVhbHM6IHtcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWQnOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgfSxcbiAgICAgICdGb3JBbnlWYWx1ZTpTdHJpbmdMaWtlJzoge1xuICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmFtcic6ICdhdXRoZW50aWNhdGVkJyxcbiAgICAgIH0sXG4gICAgfSxcbiAgICAnc3RzOkFzc3VtZVJvbGVXaXRoV2ViSWRlbnRpdHknLFxuICApLFxuICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICBpYW0uTWFuYWdlZFBvbGljeS5mcm9tQXdzTWFuYWdlZFBvbGljeU5hbWUoXG4gICAgICAnc2VydmljZS1yb2xlL0FXU0xhbWJkYUJhc2ljRXhlY3V0aW9uUm9sZScsXG4gICAgKSxcbiAgXSxcbn0pO1xuXG4gIG5ldyBjb2duaXRvLkNmbklkZW50aXR5UG9vbFJvbGVBdHRhY2htZW50KFxuICAgIHRoaXMsXG4gICAgJ2lkZW50aXR5LXBvb2wtcm9sZS1hdHRhY2htZW50JyxcbiAgICB7XG4gICAgICBpZGVudGl0eVBvb2xJZDogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgIHJvbGVzOiB7XG4gICAgICAgIGF1dGhlbnRpY2F0ZWQ6IGlzVXNlckNvZ25pdG9Hcm91cFJvbGUucm9sZUFybixcbiAgICAgICAgdW5hdXRoZW50aWNhdGVkOiBpc0Fub255bW91c0NvZ25pdG9Hcm91cFJvbGUucm9sZUFybixcbiAgICAgIH0sXG4gICAgICByb2xlTWFwcGluZ3M6IHtcbiAgICAgICAgbWFwcGluZzoge1xuICAgICAgICAgIHR5cGU6ICdUb2tlbicsXG4gICAgICAgICAgYW1iaWd1b3VzUm9sZVJlc29sdXRpb246ICdEZW55JyxcbiAgICAgICAgICBpZGVudGl0eVByb3ZpZGVyOiBgY29nbml0by1pZHAuJHtcbiAgICAgICAgICAgIGNkay5TdGFjay5vZih0aGlzKS5yZWdpb25cbiAgICAgICAgICB9LmFtYXpvbmF3cy5jb20vJHt1c2VyUG9vbC51c2VyUG9vbElkfToke1xuICAgICAgICAgICAgdXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZFxuICAgICAgICAgIH1gLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9LFxuICApO1xuXG4gIFxuICBjb25zdCBhcGkgPSBuZXcgYXBpZ2F0ZXdheS5SZXN0QXBpKHRoaXMsICdkYXRhLWh1Yicse2RlZmF1bHRDb3JzUHJlZmxpZ2h0T3B0aW9uczoge1xuICAgIGFsbG93T3JpZ2luczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9PUklHSU5TLFxuICAgIGFsbG93TWV0aG9kczogYXBpZ2F0ZXdheS5Db3JzLkFMTF9NRVRIT0RTLFxuICAgIGFsbG93SGVhZGVyczogYXBpZ2F0ZXdheS5Db3JzLkRFRkFVTFRfSEVBREVSUyxcbiAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICB9fSk7IC8vVE9ETyB1cGRhdGUgd2l0aCBmaW5hbCB3ZWIgaG9zdGluZyBvZiBmcm9udC1lbmRcbiAgLy9kZWNsYXJlIGNvbnN0IGFwaTogYXBpZ2F0ZXdheS5SZXNvdXJjZTtcbiAgXG5cblxuLy9EZWNsYXJlIHRoZSBVc2VyIFBvb2wgR3JvdXAgSUFNIHJvbGVcbi8qXG4gIGNvbnN0IEMxZ3JvdXBJQU1yb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDMVJvbGUnLCB7XG4gICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKCdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nLCB7XG4gICAgICAnU3RyaW5nRXF1YWxzJzoge1xuICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgfSxcbiAgICB9KVxuICB9KTtcbiAgXG5cbiAgXG4gIGNvbnN0IEMyZ3JvdXBJQU1yb2xlID0gbmV3IGlhbS5Sb2xlKHRoaXMsICdDMlJvbGUnLCB7XG4gICAgYXNzdW1lZEJ5OiBuZXcgaWFtLldlYklkZW50aXR5UHJpbmNpcGFsKCdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb20nLCB7XG4gICAgICAnU3RyaW5nRXF1YWxzJzoge1xuICAgICAgICAnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tOmF1ZCc6IGlkZW50aXR5UG9vbC5yZWYsXG4gICAgICAgfSxcbiAgICB9KVxuICB9KTsqL1xuICBcbiAgY29uc3QgQzFncm91cElBTXJvbGUgPSBuZXcgaWFtLlJvbGUodGhpcywgJ0MxUm9sZScsIHtcbiAgICBhc3N1bWVkQnk6IG5ldyBpYW0uQ29tcG9zaXRlUHJpbmNpcGFsKG5ldyBpYW0uV2ViSWRlbnRpdHlQcmluY2lwYWwoJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbScsIHtcbiAgICAgICdTdHJpbmdFcXVhbHMnOiB7XG4gICAgICAgICdjb2duaXRvLWlkZW50aXR5LmFtYXpvbmF3cy5jb206YXVkJzogaWRlbnRpdHlQb29sLnJlZixcbiAgICAgICB9LFxuICAgIH0pLG5ldyBpYW0uQWNjb3VudFByaW5jaXBhbCgnMTY2NjU0MDUxNzY4JykpIH1cbiAgKTtcbiAgXG4gICAgICBjb25zdCBDMmdyb3VwSUFNcm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQzJSb2xlJywge1xuICAgIGFzc3VtZWRCeTogbmV3IGlhbS5Db21wb3NpdGVQcmluY2lwYWwobmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbCgnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJywge1xuICAgICAgJ1N0cmluZ0VxdWFscyc6IHtcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWQnOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgIH0sXG4gICAgfSksbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKCcxNjY2NTQwNTE3NjgnKSkgfVxuICApO1xuICBcbiAgICBjb25zdCBBZG1pbkdyb3VwSUFNcm9sZSA9IG5ldyBpYW0uUm9sZSh0aGlzLCAnQWRtaW5Sb2xlJywge1xuICAgIGFzc3VtZWRCeTogbmV3IGlhbS5Db21wb3NpdGVQcmluY2lwYWwobmV3IGlhbS5XZWJJZGVudGl0eVByaW5jaXBhbCgnY29nbml0by1pZGVudGl0eS5hbWF6b25hd3MuY29tJywge1xuICAgICAgJ1N0cmluZ0VxdWFscyc6IHtcbiAgICAgICAgJ2NvZ25pdG8taWRlbnRpdHkuYW1hem9uYXdzLmNvbTphdWQnOiBpZGVudGl0eVBvb2wucmVmLFxuICAgICAgIH0sXG4gICAgfSksbmV3IGlhbS5BY2NvdW50UHJpbmNpcGFsKCcxNjY2NTQwNTE3NjgnKSkgfVxuICApO1xuICBcbiAgLy8gY3JlYXRlIHMzIGJ1Y2tldCB0byB1cGxvYWQgZG9jdW1lbnRzXG4gIGNvbnN0IHMzQnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnczMtYnVja2V0Jywge1xuICAgIGJ1Y2tldE5hbWU6ICdibG9nLWJ1Y2tldDMtc2Rkc2knLCAvL1RPRE8gY2hhbmdlIG5hbWVcbiAgICByZW1vdmFsUG9saWN5OiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgIGF1dG9EZWxldGVPYmplY3RzOiB0cnVlLFxuICAgIHZlcnNpb25lZDogZmFsc2UsXG4gICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgZW5jcnlwdGlvbjogczMuQnVja2V0RW5jcnlwdGlvbi5TM19NQU5BR0VELFxuICAgIGNvcnM6IFtcbiAgICAgIHtcbiAgICAgICAgYWxsb3dlZE1ldGhvZHM6IFtcbiAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5HRVQsXG4gICAgICAgICAgczMuSHR0cE1ldGhvZHMuUE9TVCxcbiAgICAgICAgICBzMy5IdHRwTWV0aG9kcy5QVVQsXG4gICAgICAgIF0sXG4gICAgICAgIGFsbG93ZWRPcmlnaW5zOiBbJyonXSwgLy9UT0RPXG4gICAgICAgIGFsbG93ZWRIZWFkZXJzOiBbJyonXSxcbiAgICAgIH0sXG4gICAgXSxcbiAgfSk7XG4gICAgXG4vLyBwZXJtaXNzaW9uIHRvIHRoZSBidWNrZXQgLSBUbyBEbyBwZXJtaXNzaW9uIFMzIHByZWZpeCB3aXNlXG5cbiBzM0J1Y2tldC5ncmFudFJlYWRXcml0ZShDMWdyb3VwSUFNcm9sZSk7XG4gczNCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoQzJncm91cElBTXJvbGUpO1xuIHMzQnVja2V0LmdyYW50UmVhZFdyaXRlKEFkbWluR3JvdXBJQU1yb2xlKTtcbiBcbiAgLy8gTGFtYmRhIEZ1bmN0aW9uc1xuICBjb25zdCBsaXN0RmlsZUxhbWJkYSA9IG5ldyBsYW1iZGEuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0xpc3RGaWxlTGFtYmRhJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgdXBsb2FkQnVja2V0TmFtZTogczNCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgIH0sIFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICBub2RlTW9kdWxlczogWydqc29ud2VidG9rZW4nXSxcbiAgICBleHRlcm5hbE1vZHVsZXM6IFtcbiAgICAgICdhd3Mtc2RrJyAvLyBVc2UgdGhlICdhd3Mtc2RrJyBhdmFpbGFibGUgaW4gdGhlIExhbWJkYSBydW50aW1lXG4gICAgXSxcbiAgfSxcbiAgICAgIC8vY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KCdsYW1iZGFzJyksXG4gICAgICBlbnRyeTogJ2xhbWJkYXMvbGlzdF9maWxlLmpzJyxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgLy8gcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgfSk7XG4gICAgXG4gICAgIGNvbnN0IHVwbG9hZEZpbGVMYW1iZGEgPSBuZXcgbGFtYmRhLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdVcGxvYWRGaWxlTGFtYmRhJywge1xuICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIHVwbG9hZEJ1Y2tldE5hbWU6IHMzQnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICB9LCBcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgbm9kZU1vZHVsZXM6IFsnanNvbndlYnRva2VuJ10sXG4gICAgZXh0ZXJuYWxNb2R1bGVzOiBbXG4gICAgICAnYXdzLXNkaycgLy8gVXNlIHRoZSAnYXdzLXNkaycgYXZhaWxhYmxlIGluIHRoZSBMYW1iZGEgcnVudGltZVxuICAgIF0sXG4gIH0sXG4gICAgICAvL2NvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhcycpLFxuICAgICAgZW50cnk6ICdsYW1iZGFzL3VwbG9hZF9maWxlLmpzJyxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIC8vcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gICAgfSk7XG4gICAgXG4gIGNvbnN0IHByZXNpZ25lZFVSTCA9IG5ldyBsYW1iZGEuTm9kZWpzRnVuY3Rpb24odGhpcywgJ1ByZXNpZ25lZFVSTCcsIHtcbiAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICB1cGxvYWRCdWNrZXROYW1lOiBzM0J1Y2tldC5idWNrZXROYW1lLFxuICAgICAgfSwgXG4gICAgICBidW5kbGluZzoge1xuICAgIG5vZGVNb2R1bGVzOiBbJ2pzb253ZWJ0b2tlbiddLFxuICAgIGV4dGVybmFsTW9kdWxlczogW1xuICAgICAgJ2F3cy1zZGsnIC8vIFVzZSB0aGUgJ2F3cy1zZGsnIGF2YWlsYWJsZSBpbiB0aGUgTGFtYmRhIHJ1bnRpbWVcbiAgICBdLFxuICB9LFxuICBcbiAgICAvL2NvZGU6IGxhbWJkYS5Db2RlLmZyb21Bc3NldCgnbGFtYmRhcy9wcmVzaWduZWRVUkwnKSxcbiAgICBlbnRyeTogJ2xhbWJkYXMvcHJlc2lnbmVkVVJMLmpzJyxcbiAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgIC8vcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzE0X1gsXG4gIH0pO1xuICBcbi8vRGVjbGFyZSB0aGUgVXNlciBQb29sIEdyb3VwXG5cbiAgY29uc3QgY2ZuVXNlclBvb2xHcm91cEMxID0gbmV3IGNvZ25pdG8uQ2ZuVXNlclBvb2xHcm91cCh0aGlzLCAnQzEnLCB7XG4gICAgdXNlclBvb2xJZDogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgXG4gICAgLy8gdGhlIHByb3BlcnRpZXMgYmVsb3cgYXJlIG9wdGlvbmFsXG4gICAgZGVzY3JpcHRpb246ICdDMSBncm91cCcsXG4gICAgZ3JvdXBOYW1lOiAnQzEnLFxuICAgIHByZWNlZGVuY2U6IDIsXG4gICAgcm9sZUFybjogQzFncm91cElBTXJvbGUucm9sZUFybixcbiAgfSk7XG4gIFxuICBjb25zdCBjZm5Vc2VyUG9vbEdyb3VwQzIgPSBuZXcgY29nbml0by5DZm5Vc2VyUG9vbEdyb3VwKHRoaXMsICdDMicsIHtcbiAgICB1c2VyUG9vbElkOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICBcbiAgICAvLyB0aGUgcHJvcGVydGllcyBiZWxvdyBhcmUgb3B0aW9uYWxcbiAgICBkZXNjcmlwdGlvbjogJ0MyIGdyb3VwJyxcbiAgICBncm91cE5hbWU6ICdDMicsXG4gICAgcHJlY2VkZW5jZTogMixcbiAgICByb2xlQXJuOiBDMmdyb3VwSUFNcm9sZS5yb2xlQXJuLFxuICB9KTtcbiAgXG4gICBjb25zdCBjZm5Vc2VyUG9vbEdyb3VwQWRtaW4gPSBuZXcgY29nbml0by5DZm5Vc2VyUG9vbEdyb3VwKHRoaXMsICdBZG1pbicsIHtcbiAgICB1c2VyUG9vbElkOiB1c2VyUG9vbC51c2VyUG9vbElkLFxuICBcbiAgICAvLyB0aGUgcHJvcGVydGllcyBiZWxvdyBhcmUgb3B0aW9uYWxcbiAgICBkZXNjcmlwdGlvbjogJ0FkbWluIGdyb3VwJyxcbiAgICBncm91cE5hbWU6ICdBZG1pbicsXG4gICAgcHJlY2VkZW5jZTogMSxcbiAgICByb2xlQXJuOiBBZG1pbkdyb3VwSUFNcm9sZS5yb2xlQXJuLFxuICB9KTtcbiAgXG4gIC8vQ3JlYXRlIEFQSSBHYXRld2F5IGJhY2tlZCBieSBMYW1iZGEgZnVuY3Rpb25zIGFzIG1pY3Jvc2VydmljZXMgZm9yIHVzZXIgYWN0aW9ucyBsaWtlIHNhdmUgZG9jdW1lbnQsIGxpc3QgZG9jdW1lbnRzLCBldGMuIFxuICAvKlxuICBjb25zdCBjb3JzT3B0aW9ucyA9IHtcbiAgICAgIGFsbG93T3JpZ2luczogQ29ycy5BTExfT1JJR0lOUyxcbiAgICAgIGFsbG93SGVhZGVyczogQ29ycy5ERUZBVUxUX0hFQURFUlMsXG4gICAgICBhbGxvd01ldGhvZHM6IENvcnMuQUxMX01FVEhPRFMsXG4gICAgfTtcbiAgXG5cbiAgY29uc3QgYXBpID0gbmV3IGFwaWdhdGV3YXkuUmVzdEFwaSh0aGlzLCAnZGF0YS1odWInLHtkZWZhdWx0Q29yc1ByZWZsaWdodE9wdGlvbnM6IHtcbiAgICAgICAgYWxsb3dIZWFkZXJzOiBbXG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZScsXG4gICAgICAgICAgJ1gtQW16LURhdGUnLFxuICAgICAgICAgICdBdXRob3JpemF0aW9uJyxcbiAgICAgICAgICAnWC1BcGktS2V5JyxcbiAgICAgICAgXSxcbiAgICAgICAgYWxsb3dNZXRob2RzOiBbJ09QVElPTlMnLCAnR0VUJywgJ1BPU1QnLCAnUFVUJywgJ1BBVENIJywgJ0RFTEVURSddLFxuICAgICAgICBhbGxvd0NyZWRlbnRpYWxzOiB0cnVlLFxuICAgICAgICBhbGxvd09yaWdpbnM6IFsnKiddLH0sfSk7IC8vVE9ETyB1cGRhdGUgd2l0aCBmaW5hbCB3ZWIgaG9zdGluZyBvZiBmcm9udC1lbmRcbiAgLy9kZWNsYXJlIGNvbnN0IGFwaTogYXBpZ2F0ZXdheS5SZXNvdXJjZTtcbiAgXG4gICovXG4gXG4gIC8vIGNyZWF0ZSBhIFMzIHB1dCBwb2xpY3kgc3RhdGVtZW50XG4gIGNvbnN0IHMzUHV0QnVja2V0UG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgIGFjdGlvbnM6IFsnczM6UHV0T2JqZWN0J10sXG4gICAgcmVzb3VyY2VzOiBbYCR7czNCdWNrZXQuYnVja2V0QXJufS8qYF0sXG4gIH0pO1xuICBcbiAgY29uc3QgczNMaXN0QnVja2V0UG9saWN5ID0gbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgIGFjdGlvbnM6IFsnczM6TGlzdEJ1Y2tldCddLFxuICAgIHJlc291cmNlczogW2Ake3MzQnVja2V0LmJ1Y2tldEFybn1gXSxcbiAgfSk7XG4gIFxuICBjb25zdCBhc3N1bWVSb2xlQ29nbml0byA9IG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICBhY3Rpb25zOiBbJ3N0czpBc3N1bWVSb2xlJ10sXG4gICAgcmVzb3VyY2VzOiBbYCR7czNCdWNrZXQuYnVja2V0QXJufWBdLFxuICB9KTtcbiAgXG5cbiAgLy8gYWRkIHRoZSBwb2xpY3kgdG8gdGhlIEZ1bmN0aW9uJ3Mgcm9sZVxuICAvKnByZXNpZ25lZFVSTC5yb2xlPy5hdHRhY2hJbmxpbmVQb2xpY3koXG4gICAgbmV3IGlhbS5Qb2xpY3kodGhpcywgJ3B1dC1idWNrZXQtcG9saWN5Jywge1xuICAgICAgc3RhdGVtZW50czogW3MzUHV0QnVja2V0UG9saWN5XSxcbiAgICB9KSxcbiAgKTtcbiAgXG4gIGxpc3RGaWxlTGFtYmRhLnJvbGU/LmF0dGFjaElubGluZVBvbGljeShcbiAgICBuZXcgaWFtLlBvbGljeSh0aGlzLCAnbGlzdC1idWNrZXQtcG9saWN5Jywge1xuICAgICAgc3RhdGVtZW50czogW3MzTGlzdEJ1Y2tldFBvbGljeV0sXG4gICAgfSksXG4gICk7Ki9cbiAgICBcbiAgLy9jb25zdCBoYW5kbGVyOiBsYW1iZGEuRnVuY3Rpb247XG4gIGFwaS5yb290LmFkZE1ldGhvZCgnQU5ZJyk7XG5cbiAgY29uc3QgdXBsb2FkZG9jID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3VwbG9hZC1kb2MnKTtcbiAgLy91cGxvYWRkb2MuYWRkTWV0aG9kKCdQT1NUJyk7XG4gIFxuICBjb25zdCBsaXN0ZG9jcyA9IGFwaS5yb290LmFkZFJlc291cmNlKCdsaXN0LWRvY3MnKTtcbiAgLy9saXN0ZG9jcy5hZGRNZXRob2QoJ0dFVCcpO1xuICBcbiAgY29uc3Qgc2lnbmVkVVJMID0gYXBpLnJvb3QuYWRkUmVzb3VyY2UoJ3NpZ25lZFVSTCcpO1xuICBcbiAgY29uc3QgYXV0aCA9IG5ldyBhcGlnYXRld2F5LkNvZ25pdG9Vc2VyUG9vbHNBdXRob3JpemVyKHRoaXMsICdibG9nQXV0aG9yaXplcicsIHtcbiAgICBjb2duaXRvVXNlclBvb2xzOiBbdXNlclBvb2xdXG4gIH0pO1xuICBcbiAgICBsaXN0ZG9jcy5hZGRNZXRob2QoJ0dFVCcsIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKGxpc3RGaWxlTGFtYmRhKSwge1xuICAgIGF1dGhvcml6ZXI6IGF1dGgsXG4gICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgfSk7XG4gIFxuICAgIHVwbG9hZGRvYy5hZGRNZXRob2QoJ1BPU1QnLCBuZXcgYXBpZ2F0ZXdheS5MYW1iZGFJbnRlZ3JhdGlvbih1cGxvYWRGaWxlTGFtYmRhKSwge1xuICAgIGF1dGhvcml6ZXI6IGF1dGgsXG4gICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgfSk7XG4gIFxuICBzaWduZWRVUkwuYWRkTWV0aG9kKCdQT1NUJywgbmV3IGFwaWdhdGV3YXkuTGFtYmRhSW50ZWdyYXRpb24ocHJlc2lnbmVkVVJMKSwge1xuICAgIGF1dGhvcml6ZXI6IGF1dGgsXG4gICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgfSk7XG4gIFxuICAvLyBDcmVhdGlvbiBvZiB0aGUgc291cmNlIGNvbnRyb2wgcmVwb3NpdG9yeVxuICAgIGNvbnN0IHJlcG9zaXRvcnkgPSBuZXcgY29kZWNvbW1pdC5SZXBvc2l0b3J5KHRoaXMsIFwiQ29kZVJlcG9CbG9ncG9zdDFcIiwge1xuICAgICAgcmVwb3NpdG9yeU5hbWU6IFwiYmxvZ3Bvc3QxLXJlcG9cIixcbiAgICAgIGRlc2NyaXB0aW9uOiBcImNvZGUgcmVwbyBmb3IgT3BlblNlYXJjaCBmcmVlIHRleHQgYW5kIHNlbWFudGljIHNlYXJjaFwiLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRpb24gb2YgQW1wbGlmeSBBcHBcbiAgICBjb25zdCBhbXBsaWZ5QXBwID0gbmV3IGFtcGxpZnlfYWxwaGEuQXBwKHRoaXMsIFwiQW1wbGlmeVJlYWN0QXBwXCIsIHtcbiAgICAgIHNvdXJjZUNvZGVQcm92aWRlcjogbmV3IGFtcGxpZnlfYWxwaGEuQ29kZUNvbW1pdFNvdXJjZUNvZGVQcm92aWRlcih7XG4gICAgICAgIHJlcG9zaXRvcnksXG4gICAgICB9KSxcbiAgICAgIGJ1aWxkU3BlYzogY29kZWJ1aWxkLkJ1aWxkU3BlYy5mcm9tT2JqZWN0VG9ZYW1sKHtcbiAgICAgICAgLy8gQWx0ZXJuYXRpdmVseSBhZGQgYSBgYW1wbGlmeS55bWxgIHRvIHRoZSByZXBvXG4gICAgICAgIHZlcnNpb246IFwiMS4wXCIsXG4gICAgICAgIGZyb250ZW5kOiB7XG4gICAgICAgICAgcGhhc2VzOiB7XG4gICAgICAgICAgICBwcmVCdWlsZDoge1xuICAgICAgICAgICAgICBjb21tYW5kczogW1wiY2QgYmxvZy1maWxlcy9yZWFjdC11aS9mcm9udGVuZFwiLFwibnBtIGluc3RhbGxcIl0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYnVpbGQ6IHtcbiAgICAgICAgICAgICAgY29tbWFuZHM6IFtcIm5wbSBydW4gYnVpbGRcIl0sXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYXJ0aWZhY3RzOiB7XG4gICAgICAgICAgICBiYXNlRGlyZWN0b3J5OiBcImJsb2ctZmlsZXMvcmVhY3QtdWkvZnJvbnRlbmQvYnVpbGRcIixcbiAgICAgICAgICAgIGZpbGVzOiBbXCIqKi8qXCJdLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgY2FjaGU6IHtcbiAgICAgICAgICAgIGNvbW1hbmRzOiBbXCJibG9nLWZpbGVzL3JlYWN0LXVpL2Zyb250ZW5kL25vZGVfbW9kdWxlcy8qKi8qXCJdLCAvL1RPRE8gY2hlY2sgaWYgY29ycmVjdCBwYXRoXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgIH0pO1xuICAgIGNvbnN0IG1hc3RlckJyYW5jaCA9IGFtcGxpZnlBcHAuYWRkQnJhbmNoKFwibWFzdGVyXCIpO1xuICBcblxuICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAndXNlclBvb2xJZCcsIHtcbiAgICB2YWx1ZTogdXNlclBvb2wudXNlclBvb2xJZCxcbiAgfSk7XG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICd1c2VyUG9vbENsaWVudElkJywge1xuICAgIHZhbHVlOiB1c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICB9KTtcbiAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ2J1Y2tldE5hbWUnLCB7XG4gICAgICB2YWx1ZTogczNCdWNrZXQuYnVja2V0TmFtZSxcbiAgfSk7XG4gIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdpZGVudGl0eVBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiBpZGVudGl0eVBvb2wucmVmLFxuICAgIH0pO1xuICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAncmVnaW9uJywge1xuICAgICAgdmFsdWU6IGNkay5TdGFjay5vZih0aGlzKS5yZWdpb24sXG4gIH0pO1xuICAgIC8vIFRoZSBjb2RlIHRoYXQgZGVmaW5lcyB5b3VyIHN0YWNrIGdvZXMgaGVyZVxuXG4gICAgLy8gZXhhbXBsZSByZXNvdXJjZVxuICAgIC8vIGNvbnN0IHF1ZXVlID0gbmV3IHNxcy5RdWV1ZSh0aGlzLCAnQmFja2VuZEluZnJhUXVldWUnLCB7XG4gICAgLy8gICB2aXNpYmlsaXR5VGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzAwKVxuICB9fVxuIl19