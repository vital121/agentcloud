'use strict';

import toObjectId from 'misc/toobjectid';
import toSnakeCase from 'misc/tosnakecase';
import { ToolType } from 'struct/tool';

import { removeAgentsTool } from '../db/agent';
import { getCredentialsByTeam } from '../db/credential';
import { addTool, deleteToolById, editTool, getToolById, getToolsByTeam } from '../db/tool';
import { chainValidations } from '../lib/utils/validationUtils';
import { dynamicResponse } from '../util';

export async function toolsData(req, res, _next) {
	const [tools, credentials] = await Promise.all([
		getToolsByTeam(req.params.resourceSlug),
		getCredentialsByTeam(req.params.resourceSlug),
	]);
	return {
		csrf: req.csrfToken(),
		tools,
		credentials,
	};
}

/**
 * GET /[resourceSlug]/tools
 * tool page html
 */
export async function toolsPage(app, req, res, next) {
	const data = await toolsData(req, res, next);
	res.locals.data = { ...data, account: res.locals.account };
	return app.render(req, res, `/${req.params.resourceSlug}/tools`);
}

/**
 * GET /[resourceSlug]/tools.json
 * team tools json data
 */
export async function toolsJson(req, res, next) {
	const data = await toolsData(req, res, next);
	return res.json({ ...data, account: res.locals.account });
}

export async function toolData(req, res, _next) {
	const [tool, credentials] = await Promise.all([
		getToolById(req.params.resourceSlug, req.params.toolId),
		getCredentialsByTeam(req.params.resourceSlug),
	]);
	return {
		csrf: req.csrfToken(),
		tool,
		credentials,
	};
}

/**
 * GET /[resourceSlug]/tool/:toolId.json
 * tool json data
 */
export async function toolJson(req, res, next) {
	const data = await toolsData(req, res, next);
	return res.json({ ...data, account: res.locals.account });
}

/**
 * GET /[resourceSlug]/tool/:toolId/edit
 * tool json data
 */
export async function toolEditPage(app, req, res, next) {
	const data = await toolData(req, res, next);
	res.locals.data = { ...data, account: res.locals.account };
	return app.render(req, res, `/${req.params.resourceSlug}/tool/${data.tool._id}/edit`);
}
 
/**
 * GET /[resourceSlug]/tool/add
 * tool json data
 */
export async function toolAddPage(app, req, res, next) {
	const data = await toolData(req, res, next);
	res.locals.data = { ...data, account: res.locals.account };
	return app.render(req, res, `/${req.params.resourceSlug}/tool/add`);
}

function validateTool(tool) {
	return chainValidations(tool, [
		{ field: 'name', validation: { notEmpty: true }},
		{ field: 'type', validation: { notEmpty: true, inSet: new Set([ToolType.API_TOOL, ToolType.HOSTED_FUNCTION_TOOL])}},
		{ field: 'data.description', validation: { notEmpty: true }},
		{ field: 'data.parameters', validation: { notEmpty: true }},
		{ field: 'schema', validation: { notEmpty: true }, validateIf: { field: 'type', condition: (value) => value == ToolType.API_TOOL }},
		{ field: 'naame', validation: { regexMatch: new RegExp('^[\\w_][A-Za-z0-9_]*$','gm'),
			customError: 'Name must not contain spaces or start with a number. Only alphanumeric and underscore characters allowed' },
		validateIf: { field: 'type', condition: (value) => value == ToolType.API_TOOL }},
		{ field: 'data.parameters.properties', validation: { objectHasKeys: true }, validateIf: { field: 'type', condition: (value) => value == ToolType.API_TOOL }},
		{ field: 'data.parameters.code', validation: { objectHasKeys: true }, validateIf: { field: 'type', condition: (value) => value == ToolType.HOSTED_FUNCTION_TOOL }},
	], { 
		name: 'Name',
		type: 'Type',
		credentialId: 'Credential',
		'data.builtin': 'Is built-in',
		'data.description': 'Description',
		'data.parameters': 'Parameters',
		'data.parameters.properties': '',
		'data.parameters.code': ''
	});
}

export async function addToolApi(req, res, next) {

	const { name, type, data, schema }  = req.body;

	const validationError = validateTool(req.body);
	if (validationError) {	
		return dynamicResponse(req, res, 400, { error: validationError });
	}

	await addTool({
		orgId: res.locals.matchingOrg.id,
		teamId: toObjectId(req.params.resourceSlug),
	    name,
	 	type: type as ToolType,
	 	schema: schema,
		data: {
			...data,
			builtin: false,
		    name: (type as ToolType) === ToolType.API_TOOL ? 'openapi_request' : toSnakeCase(name),
		},
	});

	return dynamicResponse(req, res, 302, { redirect: `/${req.params.resourceSlug}/tools` });

}

export async function editToolApi(req, res, next) {

	const { name, type, data, toolId, schema }  = req.body;

	const validationError = validateTool(req.body);
	if (validationError) {	
		return dynamicResponse(req, res, 400, { error: validationError });
	}

	await editTool(req.params.resourceSlug, toolId, {
	    name,
	 	type: type as ToolType,
	 	schema: schema,
		data: {
			...data,
			builtin: false,
		    name: (type as ToolType) === ToolType.API_TOOL ? 'openapi_request' : toSnakeCase(name),
		},
	});

	return dynamicResponse(req, res, 302, { /*redirect: `/${req.params.resourceSlug}/tools`*/ });

}

/**
 * @api {delete} /forms/tool/[toolId] Delete a tool
 * @apiName delete
 * @apiGroup Tool
 *
 * @apiParam {String} toolID tool id
 */
export async function deleteToolApi(req, res, next) {

	const { toolId } = req.body;

	if (!toolId || typeof toolId !== 'string' || toolId.length !== 24) {
		return dynamicResponse(req, res, 400, { error: 'Invalid inputs' });
	}

	await Promise.all([
		deleteToolById(req.params.resourceSlug, toolId),
		removeAgentsTool(req.params.resourceSlug, toolId),
	]);

	return dynamicResponse(req, res, 302, { /*redirect: `/${req.params.resourceSlug}/agents`*/ });

}
