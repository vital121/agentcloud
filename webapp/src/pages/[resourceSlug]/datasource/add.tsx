import dynamic from 'next/dynamic';
const CreateDatasourceForm = dynamic(() => import('components/CreateDatasourceForm'), {
	ssr: false,
});
import { useAccountContext } from 'context/account';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import React, { useEffect, useState } from 'react';

import * as API from '../../../api';

export default function AddDatasource(props) {

	const [accountContext]: any = useAccountContext();
	const { account, csrf, teamName } = accountContext as any;
	const router = useRouter();
	const { resourceSlug } = router.query;
	const [state, dispatch] = useState(props);
	const [error, setError] = useState();
	const [models, setModels] = useState();

	async function fetchDatasourceFormData() {
		await API.getModels({ resourceSlug }, (res) => setModels(res?.models), setError, router);
	}

	useEffect(() => {
		fetchDatasourceFormData();
	}, [resourceSlug]);
	
	if (models == null) {
		return 'Loading...'; //TODO: loader
	}

	return (<>

		<Head>
			<title>{`New Datasource - ${teamName}`}</title>
		</Head>

		<div className='pb-2 my-2'>
			<h3 className='pl-2 font-semibold text-gray-900'>New Datasource</h3>
		</div>

		<CreateDatasourceForm models={models} fetchDatasourceFormData={fetchDatasourceFormData} />

	</>);

}

export async function getServerSideProps({ req, res, query, resolvedUrl, locale, locales, defaultLocale }) {
	return JSON.parse(JSON.stringify({ props: res?.locals?.data || {} }));
}
