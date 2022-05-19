import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as codecommit from "aws-cdk-lib/aws-codecommit";
import * as amplify_alpha from "@aws-cdk/aws-amplify-alpha";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as triggers from "aws-cdk-lib/triggers";

export class BlogseriesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
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
    const userPoolClient = new cognito.UserPoolClient(
      this,
      "blog-userpool-client",
      {
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
      }
    );

    // create Cognito Identity Pool id
    const identityPool = new cognito.CfnIdentityPool(
      this,
      "blog-identity-pool",
      {
        identityPoolName: "blog-identity-pool",
        allowUnauthenticatedIdentities: false,
        cognitoIdentityProviders: [
          {
            clientId: userPoolClient.userPoolClientId,
            providerName: userPool.userPoolProviderName,
          },
        ],
      }
    );

    // create User
    const isAnonymousCognitoGroupRole = new iam.Role(
      this,
      "anonymous-group-role",
      {
        description: "Default role for anonymous users",
        assumedBy: new iam.FederatedPrincipal(
          "cognito-identity.amazonaws.com",
          {
            StringEquals: {
              "cognito-identity.amazonaws.com:aud": identityPool.ref,
            },
            "ForAnyValue:StringLike": {
              "cognito-identity.amazonaws.com:amr": "unauthenticated",
            },
          },
          "sts:AssumeRoleWithWebIdentity"
        ),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName(
            "service-role/AWSLambdaBasicExecutionRole"
          ),
        ],
      }
    );

    const isUserCognitoGroupRole = new iam.Role(this, "users-group-role", {
      description: "Default role for authenticated users",
      assumedBy: new iam.FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity"
      ),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSLambdaBasicExecutionRole"
        ),
      ],
    });

    new cognito.CfnIdentityPoolRoleAttachment(
      this,
      "identity-pool-role-attachment",
      {
        identityPoolId: identityPool.ref,
        roles: {
          authenticated: isUserCognitoGroupRole.roleArn,
          unauthenticated: isAnonymousCognitoGroupRole.roleArn,
        },
        roleMappings: {
          mapping: {
            type: "Token",
            ambiguousRoleResolution: "Deny",
            identityProvider: `cognito-idp.${
              cdk.Stack.of(this).region
            }.amazonaws.com/${userPool.userPoolId}:${
              userPoolClient.userPoolClientId
            }`,
          },
        },
      }
    );

    // create s3 bucket to upload documents
    const s3Bucket = new s3.Bucket(this, "s3-bucket", {
      bucketName: "blog-bucket-nagelpat", //TODO change name
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
          allowedOrigins: ["*"], //updated in separate stack once the resource is created
          allowedHeaders: ["*"],
        },
      ],
    });

    //Declare the User Pool Group IAM role
    const C1groupIAMrole = new iam.Role(this, "C1Role", {
      assumedBy: new iam.CompositePrincipal(
        new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
        }),
        new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`)
      ),
    });

    const C2groupIAMrole = new iam.Role(this, "C2Role", {
      assumedBy: new iam.CompositePrincipal(
        new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
        }),
        new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`)
      ),
    });

    const AdminGroupIAMrole = new iam.Role(this, "AdminRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": identityPool.ref,
          },
        }),
        new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`)
      ),
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
      code: codecommit.Code.fromDirectory(
        path.join(__dirname, "/../../../../react-frontend-3/"),
        "main"
      ), // Bug: branchName property is disregarded
      description: "code repository for react frontend application",
    });

    // Creation of SSM Parm for Amplify Auth backend configuration
    const ampfliyAuthParam = new ssm.StringParameter(
      this,
      "ampfliyBackendAuthParam",
      {
        allowedPattern: ".*",
        description: "Amplify Auth Backend Configuration",
        parameterName: "ampfliyBackendAuthParam",
        stringValue: `{"BlogseriesStack":{"bucketName": "${
          s3Bucket.bucketName
        }","userPoolClientId": "${
          userPoolClient.userPoolClientId
        }","region": "${cdk.Stack.of(this).region}","userPoolId": "${
          userPool.userPoolId
        }","identityPoolId": "${identityPool.ref}"}}`,
        tier: ssm.ParameterTier.STANDARD,
      }
    );

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
      description:
        "Custom role for Amplify app with read access to SSM Parameter Store",
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
    const allowOriginURL =
      "https://" + mainBranch.branchName + "." + amplifyApp.defaultDomain;

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

    presignedURLLambda.role?.attachInlinePolicy(
      new iam.Policy(this, "assume-role-presigned-policy", {
        statements: [assumeRoleCognitoPolicy],
      })
    );

    presignedURLLambda.role?.attachInlinePolicy(
      new iam.Policy(this, "cognito-user-group-policy", {
        statements: [cognitoIDPAdminPolicy],
      })
    );

    listFileLambda.role?.attachInlinePolicy(
      new iam.Policy(this, "assume-role-list-policy", {
        statements: [assumeRoleCognitoPolicy],
      })
    );

    listFileLambda.role?.attachInlinePolicy(
      new iam.Policy(this, "cognito-user-group-list-policy", {
        statements: [cognitoIDPAdminPolicy],
      })
    );

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

    const auth = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "blogAuthorizer",
      {
        cognitoUserPools: [userPool],
      }
    );

    listdocs.addMethod(
      "GET",
      new apigateway.LambdaIntegration(listFileLambda),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    signedURL.addMethod(
      "POST",
      new apigateway.LambdaIntegration(presignedURLLambda),
      {
        authorizer: auth,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      }
    );

    // add API Gateway endpoint to SSM param store to use it from the react frontend app
    const apiEndpointParam = new ssm.StringParameter(this, "apiEndpointParam", {
      allowedPattern: ".*",
      description: "Endpoint for API Gateway",
      parameterName: "apiGatewayEndpointParam",
      stringValue: `{"apiEndpoint": "${api.url}","presignedResource": "${signedURL.path}","listDocsResource": "${listdocs.path}"}`,
      tier: ssm.ParameterTier.STANDARD,
    });

    amplifyExecRole.attachInlinePolicy(
      new iam.Policy(this, "apiEndpointParamPolicy", {
        statements: [
          new iam.PolicyStatement({
            resources: [`${apiEndpointParam.parameterArn}`],
            actions: [
              "ssm:GetParameter",
            ],
          }),
        ],
      })
    );
    
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

    amplifyExecRole.attachInlinePolicy(
      new iam.Policy(this, "s3CorsRuleParamPolicy", {
        statements: [
          new iam.PolicyStatement({
            resources: [s3CorsRuleParam.parameterArn,s3BucketNameParam.parameterArn],
            actions: [
              "ssm:GetParameter",
            ],
          }),
          new iam.PolicyStatement({
            resources: [s3Bucket.bucketArn],
            actions: ["s3:PutBucketCORS"],
          }),
        ],
      })
    );

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