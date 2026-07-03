# Payara Tools for VS Code

### Ecosystem Plugin Support
Support for the VS Code IDE Payara Tools plugin is handled in the [Ecosystem Support Repository](https://github.com/payara/ecosystem-support)

### VS Code Payara Tools Documentation
Full documentation for the configuration and usage of the VS Code Payara Tools plugin can be found in the [technical documentation](https://docs.payara.fish/community/docs/Technical%20Documentation/Ecosystem/IDE%20Integration/VSCode%20Extension/Overview.html)

---

## Customizing Build Commands

The extension uses default Maven/Gradle commands for each action. You can override any command by adding a matching task to your project's `.vscode/tasks.json`. The extension matches tasks by their `label` field and uses your custom `command` instead of the default.

### How to override

Create or edit `.vscode/tasks.json` in your project root:

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "payara-server-maven-start",
      "type": "shell",
      "command": "mvn clean package fish.payara.maven.plugins:payara-server-maven-plugin:start"
    }
  ]
}
```

> **Note:** The extension writes the default task to `.vscode/tasks.json` the first time it runs an action, so you can edit it in place.

### Available task labels

#### Payara Server Maven Plugin (`payara-server-maven-plugin`)

| Label | Default command |
|---|---|
| `payara-server-maven-start` | `mvn package fish.payara.maven.plugins:payara-server-maven-plugin:start` |
| `payara-server-maven-dev` | `mvn package fish.payara.maven.plugins:payara-server-maven-plugin:dev` |
| `payara-server-maven-stop` | `mvn fish.payara.maven.plugins:payara-server-maven-plugin:stop` |

#### Payara Micro Maven Plugin (`payara-micro-maven-plugin`)

| Label | Default command |
|---|---|
| `payara-micro-exploded-war-start` | `mvn resources:resources compiler:compile war:exploded … payara-micro-maven-plugin:start` |
| `payara-micro-uber-jar-start` | `mvn install … payara-micro-maven-plugin:bundle payara-micro-maven-plugin:start` |
| `payara-micro-dev` | `mvn fish.payara.maven.plugins:payara-micro-maven-plugin:dev` |
| `payara-micro-reload` | `mvn resources:resources compiler:compile war:exploded … payara-micro-maven-plugin:reload` |
| `payara-micro-stop` | `mvn fish.payara.maven.plugins:payara-micro-maven-plugin:stop` |
| `payara-micro-bundle` | `mvn install … payara-micro-maven-plugin:bundle` |

#### Payara Server (traditional deployment)

| Label | Default command |
|---|---|
| `payara-server-build` | `mvn resources:resources compiler:compile war:war` (remote) or `war:exploded` (local) |

---

## Configuring the Debug Port

When you click **Start in Debug Mode** or **Start (Dev Mode) in Debug**, the extension attaches the VS Code Java debugger to the running server. The debug port defaults to **5005** for Payara Server Maven and Payara Micro.

On the first debug launch the extension automatically creates a configuration entry in `.vscode/launch.json`. To use a different port, edit that entry:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "java",
      "request": "attach",
      "name": "payara-server-maven",
      "hostName": "localhost",
      "port": 8000
    },
    {
      "type": "java",
      "request": "attach",
      "name": "payara-micro",
      "hostName": "localhost",
      "port": 8000
    }
  ]
}
```

The extension matches the configuration by `name`, so keep the name unchanged (`payara-server-maven` or `payara-micro`). Only the `port` (and optionally `hostName`) need to be adjusted.
