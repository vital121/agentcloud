import * as API from '@api';
import { Menu, Transition } from '@headlessui/react';
import {
	ArrowPathIcon,
	Cog6ToothIcon,
	DocumentIcon,
	EllipsisHorizontalIcon,
	PlayIcon,
	TrashIcon,
} from '@heroicons/react/20/solid';
import ButtonSpinner from 'components/ButtonSpinner';
import { useAccountContext } from 'context/account';
import { useNotificationContext } from 'context/notifications';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Fragment, useReducer,useState } from 'react';
import { toast } from 'react-toastify';
import { DatasourceStatus,datasourceStatusColors } from 'struct/datasource';
import submittingReducer from 'utils/submittingreducer';

export default function DatasourceTable({ datasources, fetchDatasources }: { datasources: any[], fetchDatasources?: any }) {

	const [notificationContext, refreshNotificationContext]: any = useNotificationContext();
	const [accountContext]: any = useAccountContext();
	const { account, csrf } = accountContext as any;
	const router = useRouter();
	const { resourceSlug } = router.query;
	const [syncing, setSyncing] = useReducer(submittingReducer, {});
	const [deleting, setDeleting] = useReducer(submittingReducer, {});

	async function deleteDatasource(datasourceId) {
		setDeleting({ [datasourceId]: true });
		try {
			await API.deleteDatasource({
				_csrf: csrf,
				resourceSlug,
				datasourceId,
			}, () => {
				// toast.success();
			}, () => {
				toast.error('Error deleting datasource');
			}, router);
			await fetchDatasources();
		} finally {
			setDeleting({ [datasourceId]: false });
		}
	}

	async function syncDatasource(datasourceId) {
		setSyncing({ [datasourceId]: true });
		try {
			await API.syncDatasource({
				_csrf: csrf,
				resourceSlug,
				datasourceId,
			}, () => {
				fetchDatasources();
			}, () => {
				toast.error('Error syncing');
			}, router);
		} finally {
			setSyncing({ [datasourceId]: false });
		}
	}

	return (

		<div className='rounded-lg overflow-hidden shadow overflow-x-auto'>
			<table className='min-w-full divide-y divide-gray-200'>
				<thead className='bg-gray-50'>
					<tr>
						<th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase'>
							Type
						</th>
						<th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
							Name
						</th>
						<th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
							Status
						</th>
						<th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
							Schedule Type
						</th>
						<th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
							Last Synced
						</th>
						<th scope='col' className='px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider'>
							Date Uploaded
						</th>
						<th scope='col' className='px-6 py-3 w-20 text-right text-xs font-medium text-gray-500 uppercase tracking-wider'>
							Actions
						</th>
					</tr>
				</thead>
				<tbody className='bg-white divide-y divide-gray-200'>
					{datasources.map((datasource) => (
						<tr key={datasource._id}>
							<td className='px-6 py-3 whitespace-nowrap flex items-center'>
								<img src={`https://connectors.airbyte.com/files/metadata/airbyte/source-${datasource.sourceType}/latest/icon.svg`} className='w-6 me-1.5' />
								<span className='px-2 inline-flex text-sm leading-6 rounded-full capitalize'>
				                    {datasource.sourceType}
								</span>
							</td>
							<td className='px-6 py-3 whitespace-nowrap'>
								<div className='flex items-center'>
									<div className='text-sm font-medium text-gray-900'>{datasource.name}</div>
								</div>
							</td>
							<td className='px-6 py-3 whitespace-nowrap'>
								<span className={`px-3 py-1 text-sm text-white rounded-full ${datasourceStatusColors[datasource.status] || 'bg-gray-500'} capitalize`}>
									{datasource.status || 'Unknown'}{[DatasourceStatus.PROCESSING, DatasourceStatus.EMBEDDING].includes(datasource.status) && <ButtonSpinner size={14} className='ms-2 -me-1' />}
								</span>
							</td>
							<td className='px-6 py-3 whitespace-nowrap'>
								<span className='px-2 inline-flex text-sm leading-5 rounded-full capitalize'>
									{datasource?.connectionSettings?.scheduleType || '-'}
								</span>
							</td>
							<td className='px-6 py-3 whitespace-nowrap'>
								<div className='text-sm text-gray-900' suppressHydrationWarning>
									{datasource.sourceType === 'file' ? 'N/A' : (datasource.lastSyncedDate ? new Date(datasource.lastSyncedDate).toLocaleString() : 'Never')}
								</div>
							</td>
							<td className='px-6 py-3 whitespace-nowrap'>
								<span className='text-sm text-gray-900'>
									{new Date(datasource.createdDate).toLocaleString()}
								</span>
							</td>
							<td className='px-6 py-5 whitespace-nowrap text-right text-sm font-medium flex justify-end space-x-5 items-center'>
								{datasource.sourceType !== 'file' && <button 
									onClick={() => syncDatasource(datasource._id)} 
									disabled={syncing[datasource._id] || deleting[datasource._id] || datasource.status !== DatasourceStatus.READY}
									className='rounded-md disabled:bg-slate-400 bg-indigo-600 px-2 -my-1 py-1 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
								>
								
									{syncing[datasource._id] && <ButtonSpinner size={14} className='ms-2 -me-1' />}
									{syncing[datasource._id] ? 'Syncing...' : 'Sync Now'}
								</button>}
		                        <a href={`/${resourceSlug}/datasource/${datasource._id}`} className='text-gray-500 hover:text-gray-700'>
		                            <Cog6ToothIcon className='h-5 w-5' aria-hidden='true' />
		                        </a>
		                        <button
		                        	onClick={() => deleteDatasource(datasource._id)}
		                        	className='text-red-500 hover:text-red-700'
		                        	disabled={deleting[datasource._id]}
		                        >
									{deleting[datasource._id] ? <ButtonSpinner size={14} /> : <TrashIcon className='h-5' aria-hidden='true' />}
		                        </button>
		                    </td>
						</tr>
					))}
				</tbody>
			</table>
		</div>

	);
}
