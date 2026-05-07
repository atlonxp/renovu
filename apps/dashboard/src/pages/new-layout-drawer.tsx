import {
	type CreateLayoutDto,
	type DuplicateLayoutDto,
	getLayoutPreset,
	LayoutCreationSourceEnum,
} from "@novu/shared";
import { useState } from "react";
import { RiArrowRightSLine } from "react-icons/ri";
import { useNavigate } from "react-router-dom";
import type { ExternalToast } from "sonner";
import { CreateLayoutForm } from "@/components/layouts/create-layout-form";
import { Button } from "@/components/primitives/button";
import { Separator } from "@/components/primitives/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetMain,
	SheetTitle,
} from "@/components/primitives/sheet";
import { Skeleton } from "@/components/primitives/skeleton";
import { ToastIcon } from "@/components/primitives/sonner";
import {
	showErrorToast,
	showSuccessToast,
	showToast,
} from "@/components/primitives/sonner-helpers";
import { ExternalLink } from "@/components/shared/external-link";
import { useEnvironment } from "@/context/environment/hooks";
import { useCreateLayout } from "@/hooks/use-create-layout";
import { useDuplicateLayout } from "@/hooks/use-duplicate-layout";
import { useFetchLayout } from "@/hooks/use-fetch-layout";
import { useOnElementUnmount } from "@/hooks/use-on-element-unmount";
import { useTelemetry } from "@/hooks/use-telemetry";
import { buildRoute, ROUTES } from "@/utils/routes";
import { TelemetryEvent } from "@/utils/telemetry";

type NewLayoutDrawerProps = {
	mode: "create" | "duplicate";
	layoutId?: string;
};

const toastOptions: ExternalToast = {
	duration: 5000,
	position: "bottom-right",
	classNames: {
		toast: "mb-4 right-0",
	},
};

export const NewLayoutDrawer = (props: NewLayoutDrawerProps) => {
	const { mode, layoutId } = props;
	const track = useTelemetry();
	const navigate = useNavigate();
	const { currentEnvironment } = useEnvironment();
	const [open, setOpen] = useState(true);

	const { layout, isPending: isLoadingLayout } = useFetchLayout({
		layoutSlug: mode === "duplicate" ? layoutId : undefined,
	});

	const { createLayout, isPending: isCreateLayoutPending } = useCreateLayout({
		onSuccess: (data) => {
			showSuccessToast(`Layout created successfully`, undefined, toastOptions);
			track(TelemetryEvent.LAYOUT_CREATED);
			handleSuccess(data.slug);
		},
		onError: (error) => {
			const errorMessage =
				error instanceof Error ? error.message : "Failed to create layout";
			showErrorToast(errorMessage);
		},
	});

	const { duplicateLayout, isPending: isDuplicateLayoutPending } =
		useDuplicateLayout({
			onSuccess: (data) => {
				showToast({
					children: () => (
						<>
							<ToastIcon variant="success" />
							<span className="text-sm">
								Duplicated layout <span className="font-bold">{data.name}</span>
							</span>
						</>
					),
					options: toastOptions,
				});
				track(TelemetryEvent.LAYOUT_DUPLICATED);
				handleSuccess(data.slug);
			},
			onError: () => {
				showToast({
					children: () => (
						<>
							<ToastIcon variant="error" />
							<span className="text-sm">
								Failed to duplicate layout{" "}
								<span className="font-bold">{layout?.name}</span>
							</span>
						</>
					),
					options: toastOptions,
				});
			},
		});

	const { ref: unmountRef } = useOnElementUnmount({
		callback: () => {
			navigate(
				buildRoute(ROUTES.LAYOUTS, {
					environmentSlug: currentEnvironment?.slug ?? "",
				}),
			);
		},
		condition: !open,
	});

	const handleSuccess = (layoutSlug: string) => {
		navigate(
			buildRoute(ROUTES.LAYOUTS_EDIT, {
				environmentSlug: currentEnvironment?.slug ?? "",
				layoutSlug,
			}),
		);
	};

	const template: DuplicateLayoutDto | undefined =
		mode === "duplicate" && layout
			? {
					name: `${layout.name} (Copy)`,
					isTranslationEnabled: layout.isTranslationEnabled ?? false,
				}
			: undefined;
	const title = mode === "create" ? "Create layout" : "Duplicate layout";
	const buttonText = mode === "create" ? "Create layout" : "Duplicate layout";
	const isLoadingTemplate = mode === "duplicate" && isLoadingLayout;

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetContent ref={unmountRef}>
				<SheetHeader>
					<SheetTitle>{title}</SheetTitle>
					<div>
						<SheetDescription>
							Create a reusable email layout template for your notifications.{" "}
							<ExternalLink href="https://docs.novu.co/platform/workflow/layouts">
								Learn more
							</ExternalLink>
						</SheetDescription>
					</div>
				</SheetHeader>
				<Separator />
				<SheetMain>
					{isLoadingTemplate ? (
						<CreateLayoutFormSkeleton />
					) : (
						<CreateLayoutForm
							disableIdentifierSlugSync={mode === "duplicate"}
							hidePresetSelector={mode === "duplicate"}
							onSubmit={(formData) => {
								if (mode === "create") {
									const preset = formData.presetId
										? getLayoutPreset(formData.presetId)
										: undefined;
									// AI-suggested container wins over preset container when AI body is set;
									// otherwise the user's preset selection drives the container.
									const initialContainer = formData.aiBody
										? (formData.aiContainer ?? preset?.container)
										: preset?.container;
									const initialBody = formData.aiBody;

									const initialEmail: NonNullable<
										NonNullable<
											CreateLayoutDto["initialControlValues"]
										>["email"]
									> = {};
									if (initialBody) initialEmail.body = initialBody;
									if (initialContainer)
										initialEmail.container = initialContainer;

									createLayout({
										layoutId: formData.layoutId,
										name: formData.name,
										isTranslationEnabled: formData.isTranslationEnabled,
										__source: LayoutCreationSourceEnum.DASHBOARD,
										...(Object.keys(initialEmail).length > 0
											? { initialControlValues: { email: initialEmail } }
											: {}),
									}).catch(() => {});

									return;
								}

								if (!layoutId) {
									return;
								}

								duplicateLayout({
									data: {
										name: formData.name,
										layoutId: formData.layoutId,
										isTranslationEnabled: formData.isTranslationEnabled,
									},
									layoutSlug: layoutId,
								}).catch(() => {});
							}}
							template={template}
						/>
					)}
				</SheetMain>
				<Separator />
				<SheetFooter>
					<Button
						isLoading={isDuplicateLayoutPending || isCreateLayoutPending}
						trailingIcon={RiArrowRightSLine}
						variant="secondary"
						mode="gradient"
						type="submit"
						form="create-layout"
						disabled={isDuplicateLayoutPending || isCreateLayoutPending}
					>
						{buttonText}
					</Button>
				</SheetFooter>
			</SheetContent>
		</Sheet>
	);
};

function CreateLayoutFormSkeleton() {
	return (
		<div className="flex flex-col gap-4">
			<div>
				<div className="mb-2">
					<Skeleton className="h-4 w-16" />
				</div>
				<Skeleton className="h-9 w-full" />
			</div>

			<div>
				<div className="mb-2">
					<Skeleton className="h-4 w-24" />
				</div>
				<Skeleton className="h-9 w-full" />
			</div>
		</div>
	);
}
