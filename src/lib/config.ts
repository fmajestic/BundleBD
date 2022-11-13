import { Options } from "rollup-plugin-styles";

export interface BundleBDOptions {
	input: string;
	output: string;
	dev: boolean;
	bdPath?: string;
	plugin?: string;
	postcssPlugins?: Options["plugins"];
}

export type Config = Partial<Pick<BundleBDOptions, "input" | "output" | "bdPath" | "postcssPlugins">>;
