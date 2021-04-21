#!/usr/bin/env zsh

host_ip="$(docker run --rm -it --privileged --pid=host debian nsenter -t 1 -m -u -n -i nslookup host.docker.internal | grep -Eo 'Address:\s*[0-9.]+' | tail -1 | awk '{ print $2 }')"
vm_ip="$(docker run --rm -it --privileged --pid=host debian nsenter -t 1 -m -u -n -i ip addr show eth0 | grep -F 'inet ' | awk '{ print $2 }' | awk -F/ '{ print $1 }')"

echo "using host ip ${host_ip}"
echo "using vm ip ${vm_ip}"
sleep 3
set -x

docker run --rm -it --privileged --pid=host debian nsenter -t 1 -m -u -n -i iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
#docker run -it --rm --privileged --pid=host debian nsenter -t 1 -m -u -n -i iptables -t nat -A OUTPUT -p udp --dport 53 -j DNAT --to "${host_ip}:15353"
#docker run -it --rm --privileged --pid=host debian nsenter -t 1 -m -u -n -i iptables -t nat -A PREROUTING -p udp -m udp -s 172.16.0.0/12 --dport 53 -j DNAT --to-destination "${host_ip}:15353"
sudo route add -net 172.16.0.0/12 "$vm_ip"

#iptables -t nat -A PREROUTING -p udp -m udp -s 172.16.0.0/12 --dport 53 -j DNAT --to-destination "${gateway_ip}:15353"
#iptables -t nat -A PREROUTING -p tcp -m tcp -s 172.16.0.0/12 --dport 53 -j DNAT --to-destination "${gateway_ip}:15353"
#iptables -t nat -A OUTPUT -p tcp --dport 53 -j DNAT --to "${gateway_ip}:15353"
#iptables -t nat -A OUTPUT -p udp --dport 53 -j DNAT --to "${gateway_ip}:15353"
