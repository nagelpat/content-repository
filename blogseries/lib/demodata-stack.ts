import { Construct } from "constructs";
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as triggers from "aws-cdk-lib/triggers";

export class DemoDataStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // imported data from Blogseries infrastructure stack
    const importedUserPoolId = cdk.Fn.importValue('userPoolId');
    const importedUserPoolArn = cdk.Fn.importValue('userPoolArn');
    const importedIdentityPoolRef = cdk.Fn.importValue('identityPoolRef');
    const importedDocumentStoreBucketArn = cdk.Fn.importValue('documentStoreBucketArn');

    // Declare the IAM roles mapped to the Cognito User Pool (CUP) groups
    const SalesGroupIAMrole = new iam.Role(this, "SalesIAMRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": importedIdentityPoolRef
          },
        }),
        new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`).withSessionTags(),
      ),
    });

    const MarketingGroupIAMrole = new iam.Role(this, "MarketingIAMRole", {
      assumedBy: new iam.CompositePrincipal(
        new iam.WebIdentityPrincipal("cognito-identity.amazonaws.com", {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": importedIdentityPoolRef,
          },
        }),
        new iam.AccountPrincipal(`${cdk.Stack.of(this).account}`).withSessionTags(),
      ),
    });

    // Create Cognito User Pool (CUP) groups and assign IAM role    
    const cfnUserPoolGroupSales = new cognito.CfnUserPoolGroup(this, "cup_group_sales", {
      userPoolId: importedUserPoolId,
      description: "Sales group",
      groupName: "sales",
      precedence: 1,
      roleArn: SalesGroupIAMrole.roleArn,
    });

    const cfnUserPoolGroupMarketing = new cognito.CfnUserPoolGroup(this, "cup_group_marketing", {
      userPoolId: importedUserPoolId,
      description: "Marketing group",
      groupName: "marketing",
      precedence: 2,
      roleArn: MarketingGroupIAMrole.roleArn,
    });

    // create policy statements to access the S3 content based on (CUP) group membership session tags
    const s3PutObjectPolicy = new iam.PolicyStatement({
      actions: ["s3:PutObject", "s3:PutObjectTagging"],
      resources: [importedDocumentStoreBucketArn+"/"+"${aws:PrincipalTag/groupname}/*"],
    });

    const s3AllowListBucketPolicy = new iam.PolicyStatement({
      actions: ["s3:ListBucket"],
      effect: iam.Effect.ALLOW,
      resources: [importedDocumentStoreBucketArn],
      conditions: {
        "StringEquals": {
          "s3:prefix": "${aws:PrincipalTag/groupname}",
        },
      },
    });

    const s3DenyListBucketPolicy = new iam.PolicyStatement({
      actions: ["s3:ListBucket"],
      effect: iam.Effect.DENY,
      resources: [importedDocumentStoreBucketArn],
      conditions: {
        "StringNotEquals": {
          "s3:prefix": "${aws:PrincipalTag/groupname}",
        },
      },
    });    

    SalesGroupIAMrole.addToPolicy(s3PutObjectPolicy);
    SalesGroupIAMrole.addToPolicy(s3AllowListBucketPolicy);
    SalesGroupIAMrole.addToPolicy(s3DenyListBucketPolicy);
    MarketingGroupIAMrole.addToPolicy(s3PutObjectPolicy);
    MarketingGroupIAMrole.addToPolicy(s3AllowListBucketPolicy);
    MarketingGroupIAMrole.addToPolicy(s3DenyListBucketPolicy);
    
    // create Cognito User Pool (CUP) users
    const sales_user: Object = {
      name: 'sales_user',
      group: cfnUserPoolGroupSales.groupName,
      password: (Math.random()+1).toString(36).substr(2,8),
    };

    const marketing_user: Object = {
      name: 'marketing_user',
      group: cfnUserPoolGroupMarketing.groupName,
      password: (Math.random()+1).toString(36).substr(2,8),
    };

    const userData = JSON.stringify([sales_user,marketing_user]);

    // trigger creation of Cognito User Pool (CUP) users and add them to the respective group
    new triggers.TriggerFunction(cdk.Stack.of(this), "cdkTriggerDemoData", {
      environment: {
        userPoolId: importedUserPoolId,
        userData: userData,
      },
      code: lambda.Code.fromAsset("lambdas/cdk"),
      runtime: lambda.Runtime.PYTHON_3_8,
      handler: "trigger_demo_data_ingestion.lambda_handler",
      timeout: cdk.Duration.seconds(30),
      executeOnHandlerChange: false,
      initialPolicy: [
        new iam.PolicyStatement({
          actions: ["cognito-idp:AdminCreateUser","cognito-idp:AdminAddUserToGroup"],
          resources: [`${importedUserPoolArn}`],
        }),
      ],
    });

    new cdk.CfnOutput(this, "demoUserData", {
      value: userData,
    });

  }
}
