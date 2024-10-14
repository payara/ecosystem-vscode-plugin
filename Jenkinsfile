#!groovy

pipeline {

    agent {
        label 'general-purpose'
    }
    tools {
        jdk "zulu-11"
        maven "maven-3.6.3"

    }
    environment {
        JAVA_HOME = tool("zulu-11")
        MAVEN_OPTS = '-Xmx2G -Djavax.net.ssl.trustStore=${JAVA_HOME}/jre/lib/security/cacerts'
        payaraBuildNumber = "${BUILD_NUMBER}"
        PATH = "$PATH:/usr/local/bin"  // Ensure the yarn binary is in PATH if not globally available

    }
    stages {

        stage('Install Dependencies') {
            steps {
                // Install project dependencies 
                sh 'curl -sL https://deb.nodesource.com/setup_20.x | sudo -E bash -'
                sh 'sudo apt-get install -y nodejs'
                sh 'sudo npm install -g yarn'

            }
        }

        stage('Build') {
            steps {
                // Build the project using yarn
                sh 'yarn install'
                sh 'yarn run tslint'
                sh 'yarn run compile'            }
        }
    }
}