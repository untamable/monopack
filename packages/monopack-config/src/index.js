// @flow
import fs from 'fs';
import path from 'path';

import _ from 'lodash';
import t from 'tcomb-validation';

export type MonopackConfig = {
  +monorepoRootPath: string,
  +webpackConfigModifier: Object => Object,
  +babelConfigModifier: Object => Object,
};

export function getMonopackConfig(mainFilePath: string): MonopackConfig {
  const directory = path.dirname(mainFilePath);
  const monopackConfigFile = lookupFileInParentDirs(
    directory,
    'monopack.config.js'
  );
  if (monopackConfigFile) {
    return buildConfigFromConfigFile(monopackConfigFile);
  } else {
    return {
      monorepoRootPath: lookupMonorepoRoot(mainFilePath),
      webpackConfigModifier: identity,
      babelConfigModifier: identity,
    };
  }
}

type ConfigFile = {
  +monorepoRootPath?: string,
  +webpackConfigModifier?: Object => Object,
  +babelConfigModifier?: Object => Object,
};
const ConfigFileTCombType = t.struct({
  monorepoRootPath: t.union([t.String, t.Nil]),
  webpackConfigModifier: t.union([t.Function, t.Nil]),
  babelConfigModifier: t.union([t.Function, t.Nil]),
});

function buildConfigFromConfigFile(configFile: string): MonopackConfig {
  // $FlowIgnore (The config is dynamically loaded !)
  const config: ConfigFile = require(configFile);
  const result = t.validate(config, ConfigFileTCombType);
  if (!result.isValid()) {
    throw new Error(`Invalid file ${configFile}
      The following errors have been found : ${JSON.stringify(
        result.errors,
        null,
        2
      )}`);
  }

  const { monorepoRootPath } = config;

  return {
    monorepoRootPath: monorepoRootPath
      ? path.resolve(path.dirname(configFile), monorepoRootPath)
      : lookupMonorepoRoot(configFile),
    webpackConfigModifier: config.webpackConfigModifier || identity,
    babelConfigModifier: config.babelConfigModifier || identity,
  };
}

function lookupMonorepoRoot(startFile: string): string {
  const directory = path.dirname(startFile);
  const lernaJson = lookupFileInParentDirs(directory, 'lerna.json');
  if (lernaJson) {
    return path.dirname(lernaJson);
  }
  const packageJsonWithWorkspaces = lookupPackageJsonWithWorkspacesInParentsDirs(
    directory
  );
  if (packageJsonWithWorkspaces) {
    return path.dirname(packageJsonWithWorkspaces);
  }

  const topMostPackageJson = lookupTopMostPackageJson(directory);
  if (topMostPackageJson) {
    return path.dirname(topMostPackageJson);
  } else {
    throw new Error(
      `Cannot find any root package.json or lerna.json to determine monorepo root from ${directory}`
    );
  }
}

function lookupFileInParentDirs(directory: string, filename: string): ?string {
  const filePath = path.join(directory, filename);
  if (fs.existsSync(filePath)) {
    return filePath;
  }

  const parentDir = path.resolve(directory, '..');
  if (parentDir === directory) {
    return undefined;
  } else {
    return lookupFileInParentDirs(parentDir, filename);
  }
}

function lookupPackageJsonWithWorkspacesInParentsDirs(directory): ?string {
  const packageJsonPath = lookupFileInParentDirs(directory, 'package.json');
  if (packageJsonPath) {
    // $FlowIgnore package.json is parsed.
    const packageJson = require(packageJsonPath);
    if (_.isArray(packageJson.workspaces)) {
      return packageJsonPath;
    }
  }

  const parentDir = path.resolve(directory, '..');
  if (parentDir === directory) {
    return undefined;
  } else {
    return lookupPackageJsonWithWorkspacesInParentsDirs(parentDir);
  }
}

function lookupTopMostPackageJson(
  directory: string,
  topMostPackageJsonSoFar: ?string = undefined
): ?string {
  const packageJsonPath = lookupFileInParentDirs(directory, 'package.json');
  if (!packageJsonPath) {
    return topMostPackageJsonSoFar;
  }

  const parentDir = path.resolve(directory, '..');
  if (parentDir === directory) {
    return topMostPackageJsonSoFar;
  } else {
    return lookupTopMostPackageJson(
      parentDir,
      packageJsonPath || topMostPackageJsonSoFar
    );
  }
}

function identity<T>(t: T): T {
  return t;
}
