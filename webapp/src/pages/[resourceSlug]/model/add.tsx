import * as API from '@api';
import ModelForm from 'components/ModelForm';
import { useAccountContext } from 'context/account';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

export default function AddModel(props) {

	const [accountContext]: any = useAccountContext();
	const { account, csrf, teamName } = accountContext as any;
	const router = useRouter();
	const { resourceSlug } = router.query;
	const [state, dispatch] = useState(props);
	const [error, setError] = useState();
	const { models, credentials } = state;

	function fetchModels() {
		API.getModels({ resourceSlug }, dispatch, setError, router);
	}

	useEffect(() => {
		fetchModels();
	}, [resourceSlug]);

	if (!models) {
		return 'Loading...'; //TODO: loader
	}

	return (<>

		<Head>
			<title>{`New Model - ${teamName}`}</title>
		</Head>

		<ModelForm credentials={credentials} />

	</>);

}

export async function getServerSideProps({ req, res, query, resolvedUrl, locale, locales, defaultLocale }) {
	return JSON.parse(JSON.stringify({ props: res?.locals?.data || {} }));
}
