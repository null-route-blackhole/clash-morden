import OriginalAccessTimeRounded from "@mui/icons-material/AccessTimeRounded";
import OriginalArrowDropDown from "@mui/icons-material/ArrowDropDown";
import OriginalChevronRight from "@mui/icons-material/ChevronRight";
import OriginalCloudUploadOutlined from "@mui/icons-material/CloudUploadOutlined";
import OriginalDnsOutlined from "@mui/icons-material/DnsOutlined";
import OriginalEventOutlined from "@mui/icons-material/EventOutlined";
import OriginalFilterAltOffRounded from "@mui/icons-material/FilterAltOffRounded";
import OriginalFilterAltRounded from "@mui/icons-material/FilterAltRounded";
import OriginalLaunchOutlined from "@mui/icons-material/LaunchOutlined";
import OriginalLockOpenRounded from "@mui/icons-material/LockOpenRounded";
import OriginalLockRounded from "@mui/icons-material/LockRounded";
import OriginalMyLocationRounded from "@mui/icons-material/MyLocationRounded";
import OriginalNetworkCheckRounded from "@mui/icons-material/NetworkCheckRounded";
import OriginalPauseRounded from "@mui/icons-material/PauseRounded";
import OriginalPlaceRounded from "@mui/icons-material/PlaceRounded";
import OriginalPlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import OriginalSettingsOutlined from "@mui/icons-material/SettingsOutlined";
import OriginalSortByAlphaRounded from "@mui/icons-material/SortByAlphaRounded";
import OriginalSortRounded from "@mui/icons-material/SortRounded";
import OriginalSpeedOutlined from "@mui/icons-material/SpeedOutlined";
import OriginalStorageOutlined from "@mui/icons-material/StorageOutlined";
import OriginalUpdateOutlined from "@mui/icons-material/UpdateOutlined";
import OriginalVisibilityOffOutlined from "@mui/icons-material/VisibilityOffOutlined";
import OriginalVisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import OriginalVisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import OriginalVisibilityRounded from "@mui/icons-material/VisibilityRounded";
import OriginalWifiTetheringOffRounded from "@mui/icons-material/WifiTetheringOffRounded";
import OriginalWifiTetheringRounded from "@mui/icons-material/WifiTetheringRounded";
import { SvgIcon, type SvgIconProps } from "@mui/material";
import {
  Activity,
  ArrowDownAZ,
  ArrowDownWideNarrow,
  Calendar,
  ChevronDown,
  ChevronRight as ChevronRightGlyph,
  Clock,
  CloudUpload,
  Database,
  ExternalLink,
  Eye,
  EyeOff,
  Filter,
  FilterX,
  Gauge,
  LocateFixed,
  Lock,
  LockOpen,
  type LucideIcon,
  MapPin,
  Pause,
  Play,
  Radio,
  RadioTower,
  RefreshCw,
  Server,
  Settings,
} from "lucide-react";

import { useInterfaceStyleStore } from "@/stores/interfaceStyleStore";

function createInterfaceIcon(Original: typeof SvgIcon, Glyph: LucideIcon) {
  return function InterfaceIcon(props: SvgIconProps) {
    const modern = useInterfaceStyleStore(
      (s) => (s.preview ?? s.appearance).style !== "clash",
    );
    if (!modern) return <Original {...props} />;
    return (
      <SvgIcon
        {...props}
        component={Glyph}
        inheritViewBox
        strokeWidth={1.65}
        sx={[
          { fill: "none", fontSize: 16 },
          ...(Array.isArray(props.sx) ? props.sx : [props.sx]),
        ]}
      />
    );
  };
}
export const AccessTimeRounded = createInterfaceIcon(
  OriginalAccessTimeRounded,
  Clock,
);
export const ArrowDropDown = createInterfaceIcon(
  OriginalArrowDropDown,
  ChevronDown,
);
export const ChevronRight = createInterfaceIcon(
  OriginalChevronRight,
  ChevronRightGlyph,
);
export const CloudUploadOutlined = createInterfaceIcon(
  OriginalCloudUploadOutlined,
  CloudUpload,
);
export const DnsOutlined = createInterfaceIcon(OriginalDnsOutlined, Server);
export const EventOutlined = createInterfaceIcon(
  OriginalEventOutlined,
  Calendar,
);
export const FilterAltOffRounded = createInterfaceIcon(
  OriginalFilterAltOffRounded,
  FilterX,
);
export const FilterAltRounded = createInterfaceIcon(
  OriginalFilterAltRounded,
  Filter,
);
export const LaunchOutlined = createInterfaceIcon(
  OriginalLaunchOutlined,
  ExternalLink,
);
export const LockOpenRounded = createInterfaceIcon(
  OriginalLockOpenRounded,
  LockOpen,
);
export const LockRounded = createInterfaceIcon(OriginalLockRounded, Lock);
export const MyLocationRounded = createInterfaceIcon(
  OriginalMyLocationRounded,
  LocateFixed,
);
export const NetworkCheckRounded = createInterfaceIcon(
  OriginalNetworkCheckRounded,
  Activity,
);
export const PauseRounded = createInterfaceIcon(OriginalPauseRounded, Pause);
export const PlaceRounded = createInterfaceIcon(OriginalPlaceRounded, MapPin);
export const PlayArrowRounded = createInterfaceIcon(
  OriginalPlayArrowRounded,
  Play,
);
export const SettingsOutlined = createInterfaceIcon(
  OriginalSettingsOutlined,
  Settings,
);
export const SortByAlphaRounded = createInterfaceIcon(
  OriginalSortByAlphaRounded,
  ArrowDownAZ,
);
export const SortRounded = createInterfaceIcon(
  OriginalSortRounded,
  ArrowDownWideNarrow,
);
export const SpeedOutlined = createInterfaceIcon(OriginalSpeedOutlined, Gauge);
export const StorageOutlined = createInterfaceIcon(
  OriginalStorageOutlined,
  Database,
);
export const UpdateOutlined = createInterfaceIcon(
  OriginalUpdateOutlined,
  RefreshCw,
);
export const VisibilityOffOutlined = createInterfaceIcon(
  OriginalVisibilityOffOutlined,
  EyeOff,
);
export const VisibilityOffRounded = createInterfaceIcon(
  OriginalVisibilityOffRounded,
  EyeOff,
);
export const VisibilityOutlined = createInterfaceIcon(
  OriginalVisibilityOutlined,
  Eye,
);
export const VisibilityRounded = createInterfaceIcon(
  OriginalVisibilityRounded,
  Eye,
);
export const WifiTetheringOffRounded = createInterfaceIcon(
  OriginalWifiTetheringOffRounded,
  RadioTower,
);
export const WifiTetheringRounded = createInterfaceIcon(
  OriginalWifiTetheringRounded,
  Radio,
);
